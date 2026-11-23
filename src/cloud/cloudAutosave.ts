/**
 * Auto-saving the open document to the account.
 *
 * Presets already sync: things somebody deliberately named and saved. What has
 * never been kept anywhere is the document actually being worked on, so a cleared
 * site-data prompt, a second laptop or a crashed tab costs a session's work.
 *
 * Shape of the thing:
 *
 *  - **Only work somebody did.** A document unchanged since it was opened or
 *    saved is already kept, as a preset, a template or the account's copy of the
 *    save, and is never written. The app says what counts through
 *    `connectDocument`.
 *  - **Nothing local.** Every existing local save path is untouched. This is a
 *    copy pushed alongside them, so a free account, a signed-out account and a
 *    dropped connection all behave exactly as they did before.
 *  - **Debounced, and deduplicated.** Idle for `IDLE_MS` or `MAX_WAIT_MS` since the
 *    first unsaved change, whichever comes first, and never for a document that
 *    serialises to what was last sent. Editing is continuous; writes should not be.
 *  - **One write in flight.** A slow connection must not queue twenty revisions of
 *    the same document behind each other.
 *  - **Conflicts are surfaced, not resolved.** Two browsers open on one document
 *    would otherwise take turns overwriting each other every few seconds and the
 *    loser would never know. The server refuses a write built on a stale revision;
 *    this reports that and stops writing until somebody chooses.
 *
 * Free accounts never reach the network here at all: `isProAccount` is checked
 * before anything is scheduled.
 *
 * Etch, Volt and Mesh each had their own copy of this engine, and they drifted:
 * Mesh grew a size gate, Volt a document name, and a fix for writing untouched
 * presets had to be made three times. Each app now makes its one engine with
 * `createCloudAutosave`, handing over its API client and its storage prefix.
 */

/** The parts of an app's API client autosave talks to. Each app has its own. */
export interface CloudAutosaveApi {
  isProAccount(): boolean;
  isProRequired(err: unknown): boolean;
  getStoredAuthToken(): string | null;
  putCloudDocument(input: {
    id: string;
    appId: string;
    name: string;
    data: unknown;
    baseRevision?: number;
    label?: string;
  }): Promise<{ revision: number }>;
  fetchCloudDocument(id: string): Promise<{
    id: string;
    revision: number;
    data: unknown;
    blobUrls?: Record<string, string>;
  }>;
  deleteCloudDocument(id: string): Promise<unknown>;
}

/** What an app's API client throws when the server refuses, read structurally. */
export interface CloudApiError {
  status: number;
  code?: string;
  message: string;
  body: Record<string, unknown>;
}

/*
 * Structural rather than `instanceof`: every app has its own `PhysBoxApiError`
 * class, and this module cannot import any of them.
 */
function apiError(err: unknown): CloudApiError | null {
  if (typeof err !== 'object' || err === null) return null;
  const e = err as Partial<CloudApiError>;
  if (typeof e.status !== 'number') return null;
  return {
    status: e.status,
    code: typeof e.code === 'string' ? e.code : undefined,
    message: typeof e.message === 'string' ? e.message : '',
    body: typeof e.body === 'object' && e.body !== null ? e.body : {},
  };
}

export interface CloudAutosaveOptions {
  /** Which app's documents these are, as the API files them: `etch`, `circuit`, `physics`. */
  appId: string;
  /**
   * Prefix for this browser's own keys. Each app keeps the one it always had, so
   * moving the engine here did not orphan the document a browser was writing to
   * or the unsaved work it had on offer.
   */
  storagePrefix: string;
  api: CloudAutosaveApi;
  /**
   * How much of a serialised document does not travel with it — Mesh's big
   * meshes go to the blob store — so the size gate measures what is sent.
   */
  externalizableChars?(data: unknown): number;
  /** The document as it goes to the account. */
  toCloud?(data: unknown): Promise<unknown>;
  /** The document as it comes back, before it is put on screen. */
  fromCloud?(doc: { data: unknown; blobUrls?: Record<string, string> }): Promise<unknown>;
  /**
   * A refusal the app knows is worth trying again, once it has done whatever
   * makes the retry different. True to retry on the usual backoff.
   */
  recoverable?(err: CloudApiError): boolean;
}

/** This browser's storage keys, from the app's prefix. */
interface Keys {
  /** Which cloud document this browser's working copy belongs to. */
  documentId: string;
  /**
   * The account's copy of work nobody saved, noted for the next time the app opens.
   *
   * Closing a tab is not asked about when autosave holds the latest, so this is
   * what brings that work back. Only a write of unsaved work notes it: a scene
   * opened and left alone has nothing to offer.
   */
  draft: string;
  /** Held by every open tab, so a new one can tell a closed session from a live one. */
  tabLock: string;
}

/**
 * Raised by an app's preset sync when two saves under one name could not both
 * keep it, so one was renamed; `CloudSaveStatus` says so.
 */
export const PRESET_KEPT_BOTH_EVENT = 'physbox:preset-kept-both';

/** Long enough for the lock of the page a reload just replaced to go. */
const DRAFT_OFFER_DELAY_MS = 500;

/** An offer ignored for a week is not going to be taken up. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Quiet time before a save. Long enough to cover typing, short enough to feel safe. */
const IDLE_MS = 3000;

/**
 * Longest a change may go unsaved while someone keeps editing.
 *
 * Without this, continuous work — dragging a node for two minutes — would reset
 * the idle timer forever and never save at all.
 */
const MAX_WAIT_MS = 30000;

/**
 * Shortest gap between serialising the document to see whether it changed.
 *
 * Dragging an element fires a change per frame. Hashing a whole scene sixty times
 * a second to discover that the user is still dragging would be work done purely
 * to find out that no work is needed.
 */
const COALESCE_MS = 750;

/** Backoff after a failed write, doubling to this ceiling. */
const RETRY_MS = 5000;
const MAX_RETRY_MS = 120000;

/**
 * The largest document the account will take, mirrored from the API.
 *
 * Checked here as well as there because the alternative is discovering it by
 * uploading: a document over the limit is over it on every save for the rest of
 * the session, and that is a stream of refused multi-megabyte POSTs from a
 * machine that is very likely driving a mill over USB at the time.
 *
 * `physbox_api`'s `MAX_DOCUMENT_BYTES` is 32 MB — set by that service's memory,
 * not by storage — and the body is gzipped on the way out, so a relief goes up
 * at about a seventh of this. Kept a little under the server's number so a
 * document that passes here is not then refused there over the difference
 * between a string's length and its UTF-8 byte count.
 */
const MAX_DOCUMENT_BYTES = 31 * 1024 * 1024;

/**
 * Past this, a document is saved on a slower clock.
 *
 * Autosave's three seconds is right for a scene of primitives. For thirty
 * megabytes of vertices it means serialising, compressing and uploading the
 * whole thing every few seconds — on the machine that is streaming G-code — to
 * capture edits somebody is still in the middle of making. The work is already
 * safe locally; the cloud copy can be a minute behind.
 */
const BIG_DOCUMENT_BYTES = 2 * 1024 * 1024;
const BIG_IDLE_MS = 20000;
const BIG_MAX_WAIT_MS = 120000;

/** Bytes, as something to put in a sentence. */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} kB`;
}

/**
 * What the badge says when the document cannot fit in the account.
 *
 * It used to end "saved on this device", which nothing here makes true: autosave
 * writes only to the account, and a scene too big for the account is far too big
 * for localStorage. Exporting is the one way to keep it, so it says that.
 */
function tooLargeMessage(bytes: number): string {
  return `Too big to sync (${formatBytes(bytes)} of ${formatBytes(
    MAX_DOCUMENT_BYTES
  )}) — not saved. Export a copy to keep it.`;
}

export type AutosaveState =
  | 'idle'
  | 'pending'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'conflict'
  | 'disabled';

export interface AutosaveStatus {
  state: AutosaveState;
  /** The cloud document this browser is writing to, once there is one. */
  documentId: string | null;
  revision: number | null;
  savedAt: number | null;
  message: string | null;
  /** Set when the server holds a newer revision than the one we started from. */
  conflictRevision: number | null;
  /** Unsaved work from the last session, while it is on offer. */
  draft: CloudDraft | null;
}

export interface CloudDraft {
  documentId: string;
  name: string;
  /** When it was written, ms since the epoch. */
  at: number;
  /** A draft still on offer when this session started writing a new one. */
  older?: CloudDraft;
}

type Listener = (status: AutosaveStatus) => void;

/**
 * A cheap content hash.
 *
 * Only ever compared against another hash of the same function's output, so it
 * needs to be fast and stable, not cryptographic — this runs on every keystroke's
 * worth of state change.
 */
function hash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) + h) ^ text.charCodeAt(i);
  }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the cloud copy is a convenience, not a promise.
  }
}

function readDraft(key: string): CloudDraft | null {
  try {
    const raw = readStored(key);
    return raw ? (JSON.parse(raw) as CloudDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: CloudDraft | null): void {
  writeStored(key, draft ? JSON.stringify(draft) : null);
}

/** Whether another tab of this app is open. Without Web Locks, every tab counts as alone. */
async function otherTabOpen(lock: string): Promise<boolean> {
  try {
    const { held } = await navigator.locks.query();
    return Boolean(held?.some((h) => h.name === lock));
  } catch {
    return false;
  }
}

/** Held until the tab goes, however it goes, which a flag written on close cannot promise. */
function holdTabLock(lock: string): void {
  try {
    void navigator.locks.request(lock, { mode: 'shared' }, () => new Promise(() => {})).catch(() => {});
  } catch {
    // No Web Locks here; see otherTabOpen.
  }
}

/** A document id this browser owns, minted once and then reused. */
function ensureDocumentId(key: string): string {
  const existing = readStored(key);
  if (existing) return existing;
  const id = mintDocumentId();
  writeStored(key, id);
  return id;
}

/** Minted here rather than by the server so a document created offline keeps its identity when it eventually syncs. */
function mintDocumentId(): string {
  return `doc_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export class CloudAutosave {
  private readonly api: CloudAutosaveApi;
  private readonly options: CloudAutosaveOptions;
  private readonly keys: Keys;

  private status: AutosaveStatus = {
    state: 'idle',
    documentId: null,
    revision: null,
    savedAt: null,
    message: null,
    conflictRevision: null,
    draft: null,
  };

  private listeners = new Set<Listener>();
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MS;

  private pendingName = '';
  private pendingData: unknown = null;
  /** The most recent document offered, waiting to be hashed. See `schedule`. */
  private latest: { name: string; data: unknown | (() => unknown) } | null = null;
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSerializedAt = 0;
  private pendingHash: string | null = null;
  private lastSentHash: string | null = null;
  private inFlight = false;
  /** Settles when the write in flight has finished. */
  private writing: Promise<void> | null = null;
  /** What the open document is called, as last offered to `schedule`. */
  private documentName: string | null = null;
  /** The document holding last session's work, which writes keep off until it is settled. */
  private protectedDraft: CloudDraft | null = null;
  /**
   * This tab's own document, when another tab already has the browser's. Two tabs
   * are two pieces of work, usually on different scenes, and one document would
   * have them overwriting each other. Only ever held in memory: it is this tab's.
   */
  private tabDocumentId: string | null = null;
  private hasUnsavedWork: () => boolean = () => false;
  private applyDraft: ((data: unknown, name: string) => void) | null = null;
  /** Whether this session has asked the account what revision it holds. */
  private primed = false;
  /** Set after a conflict; nothing is written again until it is cleared. */
  private blocked = false;
  /**
   * Set while the document is bigger than the account will take.
   *
   * Separate from `blocked` because it is not a decision anybody has to make and
   * it can stop being true on its own: delete the imported mesh and the next
   * serialisation is under the limit, so this clears and saving resumes. A
   * conflict needs a person; this needs an edit.
   */
  private tooLarge = false;

  constructor(options: CloudAutosaveOptions) {
    this.options = options;
    this.api = options.api;
    const p = options.storagePrefix;
    this.keys = { documentId: `${p}_cloud_document_id`, draft: `${p}_cloud_draft`, tabLock: `${p}_open_tab` };
    this.status.documentId = readStored(this.keys.documentId);
    if (typeof window !== 'undefined') {
      // A tab being closed is the one moment a few unsaved seconds actually
      // matter, and it is also the moment there is no time for a normal request.
      window.addEventListener('beforeunload', () => this.flushOnUnload());
      window.addEventListener('online', () => {
        if (this.pendingHash && !this.blocked) this.save();
      });
      this.protectedDraft = this.enabled() ? readDraft(this.keys.draft) : null;
      setTimeout(() => void this.settleDraft(), DRAFT_OFFER_DELAY_MS);
    }
  }

  /** Puts last session's unsaved work on offer, unless that session is still open in another tab. */
  private async settleDraft(): Promise<void> {
    const live = await otherTabOpen(this.keys.tabLock);
    holdTabLock(this.keys.tabLock);
    if (live) {
      this.protectedDraft = null;
      this.tabDocumentId = mintDocumentId();
      this.primed = true;
      this.set({ documentId: this.tabDocumentId, revision: null });
      return;
    }
    const draft = this.protectedDraft;
    if (!draft) return;
    if (Date.now() - draft.at > DRAFT_MAX_AGE_MS) {
      this.protectedDraft = null;
      writeDraft(this.keys.draft, null);
      return;
    }
    if (draft.older) {
      void this.api.deleteCloudDocument(draft.older.documentId);
      delete draft.older;
      writeDraft(this.keys.draft, draft);
    }
    this.set({ draft });
  }

  /** How this module reaches the document on screen. */
  connectDocument(hasUnsavedWork: () => boolean, applyDraft: (data: unknown, name: string) => void): void {
    this.hasUnsavedWork = hasUnsavedWork;
    this.applyDraft = applyDraft;
  }

  /** Puts the offered work back on screen. False when it could not be fetched. */
  async restoreDraft(): Promise<boolean> {
    const { draft } = this.status;
    if (!draft || !this.applyDraft) return false;
    try {
      const doc = await this.api.fetchCloudDocument(draft.documentId);
      const data = this.options.fromCloud ? await this.options.fromCloud(doc) : doc.data;
      this.applyDraft(data, draft.name);
      this.protectedDraft = null;
      writeStored(this.keys.documentId, draft.documentId);
      this.primed = true;
      this.lastSentHash = null;
      this.set({ draft: null, documentId: draft.documentId, revision: doc.revision });
      return true;
    } catch (err) {
      console.warn('[PhysBox Cloud] Could not restore unsaved work:', err);
      return false;
    }
  }

  /** Lets the offered work go. */
  dismissDraft(): void {
    const { draft } = this.status;
    if (!draft) return;
    this.protectedDraft = null;
    this.set({ draft: null });
    const held = readDraft(this.keys.draft);
    if (held?.documentId === draft.documentId) {
      writeDraft(this.keys.draft, null);
    } else if (held?.older) {
      delete held.older;
      writeDraft(this.keys.draft, held);
    }
    if (draft.documentId !== readStored(this.keys.documentId)) void this.api.deleteCloudDocument(draft.documentId);
    void this.save();
  }

  /**
   * The document to write to.
   *
   * While last session's work is on offer, a scene nobody has touched is not
   * written over it, and edits go to a new document so it stays restorable.
   * Null when the write should wait for the offer to be settled.
   */
  private writeTarget(deliberate = false): string | null {
    // A second tab that nobody has touched has nothing to keep.
    if (this.tabDocumentId) return deliberate || this.hasUnsavedWork() ? this.tabDocumentId : null;
    const id = ensureDocumentId(this.keys.documentId);
    if (this.protectedDraft?.documentId !== id) return id;
    if (!deliberate && !this.hasUnsavedWork()) return null;
    writeStored(this.keys.documentId, null);
    this.primed = true;
    const fresh = ensureDocumentId(this.keys.documentId);
    this.set({ documentId: fresh, revision: null });
    return fresh;
  }

  /** After a write: notes unsaved work for the next session, or that there is none. */
  private noteDraft(id: string, name: string): void {
    if (!this.hasUnsavedWork()) {
      this.clearDraft(id);
      return;
    }
    const held = readDraft(this.keys.draft);
    const older = this.protectedDraft ?? held?.older;
    writeDraft(this.keys.draft, { documentId: id, name, at: Date.now(), older: older?.documentId === id ? undefined : older });
  }

  private clearDraft(id: string): void {
    const held = readDraft(this.keys.draft);
    if (held?.documentId === id) writeDraft(this.keys.draft, held.older ?? null);
  }

  /** Marks a write as under way; the function returned ends it. */
  private beginWrite(): () => void {
    this.inFlight = true;
    let finish = () => {};
    this.writing = new Promise((resolve) => {
      finish = resolve;
    });
    return () => {
      this.inFlight = false;
      this.writing = null;
      finish();
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  getStatus(): AutosaveStatus {
    return this.status;
  }

  /**
   * The open document's name, for labelling something other than a save — a
   * machine run, in practice. Null until the document has been offered once.
   */
  getDocumentName(): string | null {
    return this.documentName;
  }

  /**
   * The document as it goes to the account. When the app's own step fails — a
   * blob store that cannot be reached — it goes whole, as it did before there
   * was one.
   */
  private async toCloud(data: unknown): Promise<unknown> {
    if (!this.options.toCloud) return data;
    try {
      return await this.options.toCloud(data);
    } catch (err) {
      console.warn('[PhysBox Cloud] Could not prepare the document; saving it whole:', err);
      return data;
    }
  }

  private set(patch: Partial<AutosaveStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener(this.status);
  }

  private enabled(): boolean {
    return Boolean(this.api.getStoredAuthToken()) && this.api.isProAccount();
  }

  /**
   * Offers the current document for saving.
   *
   * Called on every change, and a change can mean every frame of a drag — so this
   * must be cheap on the hot path. Serialising a scene to compare it against the
   * last one is not cheap, so rapid calls are coalesced and only the most recent
   * document is ever hashed. Below the coalescing window this does nothing but
   * store a reference.
   *
   * `data` may be a function that builds the document, so a caller whose
   * document is itself costly to assemble pays for it only when it is hashed.
   */
  schedule(name: string, data: unknown | (() => unknown)): void {
    // Kept whatever happens to the save. It is the only place this module is
    // ever told what the open document is called, and a run started from a
    // signed-out session still wants a name on it the moment one signs in.
    this.documentName = name;
    if (!this.enabled()) {
      if (this.status.state !== 'disabled') {
        this.set({ state: 'disabled', message: null });
      }
      return;
    }
    // Kept through a conflict: resolving it sends what is on screen by then.
    this.latest = { name, data };
    if (this.blocked) return;

    const since = Date.now() - this.lastSerializedAt;
    if (since >= COALESCE_MS) {
      this.ingest();
      return;
    }
    if (!this.coalesceTimer) {
      this.coalesceTimer = setTimeout(() => {
        this.coalesceTimer = null;
        this.ingest();
      }, COALESCE_MS - since);
    }
  }

  /** Hashes the most recent document offered, and starts the save timers. */
  private ingest(): void {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
    const latest = this.latest;
    if (!latest || this.blocked || !this.enabled()) return;

    this.lastSerializedAt = Date.now();
    const { name } = latest;

    let data: unknown;
    let serialized: string;
    try {
      data = typeof latest.data === 'function' ? (latest.data as () => unknown)() : latest.data;
      serialized = JSON.stringify(data);
    } catch {
      // A document that will not serialise cannot be saved to anything; the local
      // paths have the same problem and there is nothing useful to say about it.
      return;
    }

    /*
     * The size gate goes here, where the document has just been serialised
     * anyway, so it costs a `.length` rather than a second pass over a scene.
     */
    // What is sent: big meshes go to the blob store, not in the document.
    const sending = serialized.length - (this.options.externalizableChars?.(data) ?? 0);
    if (sending > MAX_DOCUMENT_BYTES) {
      this.tooLarge = true;
      this.pendingHash = null;
      this.clearTimers();
      this.set({ state: 'offline', message: tooLargeMessage(sending) });
      return;
    }
    if (this.tooLarge) {
      // Back under the limit — whatever was making it big is gone.
      this.tooLarge = false;
      this.set({ state: 'idle', message: null });
    }

    const next = hash(serialized);
    if (next === this.lastSentHash) return;
    if (next === this.pendingHash) {
      this.pendingName = name;
      return;
    }

    this.pendingName = name;
    this.pendingData = data;
    this.pendingHash = next;
    this.set({ state: 'pending' });

    const big = serialized.length > BIG_DOCUMENT_BYTES;

    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.save(), big ? BIG_IDLE_MS : IDLE_MS);

    if (!this.maxWaitTimer) {
      this.maxWaitTimer = setTimeout(() => this.save(), big ? BIG_MAX_WAIT_MS : MAX_WAIT_MS);
    }
  }

  /** Writes now, if there is anything to write. */
  async flush(): Promise<void> {
    // A document offered inside the coalescing window has not been hashed yet, and
    // "save now" has to mean the latest one rather than the last one hashed.
    this.ingest();
    await this.save();
  }

  /**
   * Writes immediately and marks the result as a checkpoint somebody meant.
   *
   * Automatic checkpoints are guesses about when a snapshot might be useful. A
   * deliberate save is not a guess, and the pruner never throws a labelled one
   * away — so "the version before I changed the kerf" stays findable.
   */
  async saveExplicit(name: string, data: unknown, label: string): Promise<void> {
    if (!this.enabled() || this.blocked) return;
    try {
      const sending = JSON.stringify(data).length - (this.options.externalizableChars?.(data) ?? 0);
      if (sending > MAX_DOCUMENT_BYTES) {
        this.tooLarge = true;
        this.set({ state: 'offline', message: tooLargeMessage(sending) });
        return;
      }
    } catch {
      return;
    }
    // An autosave in flight moves the revision this write has to be built on.
    while (this.writing) await this.writing;
    if (this.blocked) return;
    const id = this.writeTarget(true)!;
    this.clearTimers();
    const superseded = this.pendingHash;
    const finishWrite = this.beginWrite();
    this.set({ state: 'saving', documentId: id });
    try {
      const res = await this.api.putCloudDocument({
        id,
        appId: this.options.appId,
        name,
        data: await this.toCloud(data),
        baseRevision: this.status.revision ?? undefined,
        label,
      });
      try {
        this.lastSentHash = hash(JSON.stringify(data));
      } catch {
        this.lastSentHash = null;
      }
      if (this.pendingHash === superseded) this.pendingHash = null;
      this.set({
        state: this.pendingHash ? 'pending' : 'saved',
        revision: res.revision,
        savedAt: Date.now(),
        message: null,
      });
      this.clearDraft(id);
      if (this.pendingHash) this.idleTimer = setTimeout(() => this.save(), IDLE_MS);
    } catch (err) {
      this.handleFailure(err);
    } finally {
      finishWrite();
    }
  }

  /**
   * Cancels the save timers.
   *
   * Deliberately leaves the coalescing timer alone: this runs from `save()`, and
   * that timer may be holding a document newer than the one being written. Killing
   * it there would strand those edits until the user happened to touch something
   * again. Only `ingest` clears it, because only `ingest` consumes it.
   */
  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxWaitTimer) clearTimeout(this.maxWaitTimer);
    this.idleTimer = null;
    this.maxWaitTimer = null;
  }

  /**
   * Learns the revision the account currently holds, once per session.
   *
   * Without this, the first write of a session sends no `base_revision` and the
   * server accepts it — which is right for a document that has never synced, and
   * wrong for the case this whole mechanism exists for. Open the same account in a
   * second browser and its first autosave would blindly overwrite whatever the
   * first one had written, with no conflict raised, because it had no revision to
   * be stale against.
   *
   * A 404 is the good outcome for a genuinely new document: nothing to be stale
   * against, so the write proceeds and creates it. Only the *revision* is adopted,
   * never the content — a pull that replaced what is on screen is not something an
   * autosave should ever do on its own.
   */
  private async primeRevision(id: string): Promise<void> {
    if (this.primed) return;
    this.primed = true;
    try {
      const doc = await this.api.fetchCloudDocument(id);
      this.set({ revision: doc.revision, documentId: doc.id });
    } catch {
      // Not there, or unreachable. Either way the write below decides what happens.
    }
  }

  private async save(): Promise<void> {
    this.clearTimers();
    if (this.inFlight || this.blocked || this.tooLarge || this.pendingHash === null) return;
    if (!this.enabled()) return;

    /*
     * A document nobody has changed since it was opened or saved is already kept:
     * as a preset, a template, or the account's copy of the save. Writing it
     * anyway put "Saving to your account…" up the moment the app opened on a
     * preset, before anyone had touched anything, and spent a revision of the
     * working document on a template. An undo back to the clean point lands here
     * too, and then the note of unsaved work goes: there is none to offer.
     */
    if (!this.hasUnsavedWork()) {
      this.pendingHash = null;
      const current = this.tabDocumentId ?? readStored(this.keys.documentId);
      if (current && this.protectedDraft?.documentId !== current) this.clearDraft(current);
      this.set({ state: 'idle' });
      return;
    }

    const id = this.writeTarget();
    if (id === null) return;
    const finishWrite = this.beginWrite();

    try {
      if (this.status.revision === null) await this.primeRevision(id);
      const name = this.pendingName;
      const data = this.pendingData;
      const sending = this.pendingHash;
      this.set({ state: 'saving', documentId: id, message: null });

      const res = await this.api.putCloudDocument({
        id,
        appId: this.options.appId,
        name,
        data: await this.toCloud(data),
        // Undefined on the very first write of a session, which is what lets an
        // offline-first document land without knowing the server's revision.
        baseRevision: this.status.revision ?? undefined,
      });

      this.lastSentHash = sending;
      if (this.pendingHash === sending) this.pendingHash = null;
      this.noteDraft(id, name);
      this.retryDelay = RETRY_MS;
      this.set({
        state: this.pendingHash ? 'pending' : 'saved',
        revision: res.revision,
        savedAt: Date.now(),
        message: null,
      });

      // Something arrived while this was in flight.
      if (this.pendingHash) this.idleTimer = setTimeout(() => this.save(), IDLE_MS);
    } catch (err) {
      this.handleFailure(err);
    } finally {
      finishWrite();
    }
  }

  private handleFailure(err: unknown): void {
    const refused = apiError(err);
    if (refused && this.options.recoverable?.(refused)) {
      // Not a conflict: something the app can put right, and has. Try again on
      // the usual backoff.
      this.set({ state: 'offline', message: 'Not synced yet — retrying.' });
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => this.save(), this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
      return;
    }
    if (refused?.status === 409) {
      /*
       * Somebody else moved the document. Do not write again: last-write-wins
       * across two machines is exactly the failure this feature exists to
       * prevent, and the person deserves to be asked.
       */
      this.blocked = true;
      this.set({
        state: 'conflict',
        conflictRevision: typeof refused?.body.revision === 'number' ? refused.body.revision : null,
        message: 'This document was changed on another device.',
      });
      return;
    }

    if (this.api.isProRequired(err)) {
      // The account changed under us; stop trying rather than 403 forever.
      this.blocked = true;
      this.set({ state: 'disabled', message: null });
      return;
    }

    if (refused?.status === 413) {
      /*
       * The gate in `ingest` should have caught this, so reaching here means the
       * server's limit is lower than the one compiled in — say what the server
       * said if it managed to say anything, and otherwise say something a person
       * can act on rather than `HTTP error 413`.
       *
       * `tooLarge` rather than `blocked`: shrinking the document must be enough
       * to start saving again, without a reload.
       */
      this.tooLarge = true;
      this.pendingHash = null;
      const sizeBytes = typeof refused?.body.sizeBytes === 'number' ? refused.body.sizeBytes : null;
      this.set({
        state: 'offline',
        message: refused?.code === 'document_too_large'
          ? refused.message
          : tooLargeMessage(sizeBytes ?? MAX_DOCUMENT_BYTES),
      });
      return;
    }

    /*
     * Anything else is treated as reachability, and nothing is stashed anywhere.
     * Nor is the work on this device: autosave has no local copy, only a preset
     * saved by hand does, so the badge does not claim one.
     */
    this.set({ state: 'offline', message: 'Not synced yet — retrying.' });

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.save(), this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
  }

  /**
   * A last attempt as the tab goes away.
   *
   * `fetch` with `keepalive` is the only thing that survives an unload, and it is
   * capped at 64 KB — so this is a best-effort for small documents and a no-op for
   * large ones. Nothing is lost either way: the local copy is already written.
   */
  private flushOnUnload(): void {
    this.ingest();
    if (this.pendingHash === null || this.blocked || this.tooLarge || !this.enabled()) return;
    void this.save();
  }

  /**
   * Whether the account already holds the latest document, so closing the tab
   * loses nothing. Hashes anything still waiting in the coalescing window
   * first: an edit made a moment ago has not been looked at yet.
   */
  holdsLatest(): boolean {
    this.ingest();
    return this.enabled() && !this.blocked && !this.tooLarge && !this.inFlight
      && this.pendingHash === null && this.lastSentHash !== null;
  }

  /** After a conflict: keep this browser's copy and overwrite the account's. */
  async keepLocalCopy(): Promise<void> {
    const id = this.status.documentId;
    if (!id) return;
    // Adopt the server's revision so the next write is no longer stale, then let
    // the normal path send the local document on top of it.
    try {
      const doc = await this.api.fetchCloudDocument(id);
      this.set({ revision: doc.revision });
    } catch {
      this.set({ revision: null });
    }
    this.blocked = false;
    this.tooLarge = false;
    this.lastSentHash = null;
    this.ingest();
    this.set({ state: 'pending', conflictRevision: null, message: null });
    await this.save();
  }

  /**
   * Starts a separate cloud document for this browser's copy.
   *
   * The escape hatch for a conflict somebody does not want to resolve: both
   * versions survive, under different ids.
   */
  forkDocument(): void {
    writeStored(this.keys.documentId, null);
    this.blocked = false;
    this.tooLarge = false;
    this.lastSentHash = null;
    this.ingest();
    // A new id has no revision on the server, and must not inherit the old one's.
    this.primed = true;
    this.set({
      state: 'pending',
      documentId: ensureDocumentId(this.keys.documentId),
      revision: null,
      conflictRevision: null,
      message: null,
    });
    void this.save();
  }

}

/** One per app, made by the app's own `cloudDocuments` module with its API client. */
export function createCloudAutosave(options: CloudAutosaveOptions): CloudAutosave {
  return new CloudAutosave(options);
}
