import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCloudAutosave, type CloudAutosaveOptions } from '../src/cloud';

/**
 * Unsaved work left with the account has to be gettable back: noted when it is
 * written, offered once by the next session, and out of reach of that session's
 * own autosave until somebody settles the offer.
 */

class FakeApiError extends Error {
  status: number;
  code?: string;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown> = {}) {
    super('refused');
    this.status = status;
    this.body = body;
    this.code = typeof body.code === 'string' ? body.code : undefined;
  }
}

/** The account's documents, refusing a write built on a stale revision. */
const server = {
  docs: new Map<string, { revision: number; data: unknown }>(),
  writes: [] as { id: string; data: unknown; baseRevision?: number }[],
  deleted: [] as string[],
  latencyMs: 0,
};

const api = {
  isProAccount: () => true,
  isProRequired: () => false,
  getStoredAuthToken: () => 'token',
  fetchCloudDocument: async (id: string) => {
    const doc = server.docs.get(id);
    if (!doc) throw new FakeApiError(404);
    return { id, ...doc };
  },
  deleteCloudDocument: async (id: string) => {
    server.deleted.push(id);
    server.docs.delete(id);
    return true;
  },
  putCloudDocument: async (input: { id: string; data: unknown; baseRevision?: number }) => {
    if (server.latencyMs) await new Promise((resolve) => setTimeout(resolve, server.latencyMs));
    const held = server.docs.get(input.id);
    if (held && input.baseRevision !== undefined && input.baseRevision !== held.revision) {
      throw new FakeApiError(409, { code: 'revision_conflict', revision: held.revision });
    }
    const revision = (held?.revision ?? 0) + 1;
    server.docs.set(input.id, { revision, data: input.data });
    server.writes.push(input);
    return { id: input.id, revision };
  },
};

const storage = new Map<string, string>();
const heldLocks: { name: string }[] = [];

async function newSession(unsaved: { now: boolean }, extra: Partial<CloudAutosaveOptions> = {}) {
  const cloudAutosave = createCloudAutosave({ appId: 'etch', storagePrefix: 'etch', api, ...extra });
  const restored: { data: unknown; name: string }[] = [];
  cloudAutosave.connectDocument(() => unsaved.now, (data, name) => restored.push({ data, name }));
  await vi.advanceTimersByTimeAsync(600);
  return { autosave: cloudAutosave, restored };
}

/** One edit, autosaved. */
async function write(autosave: Awaited<ReturnType<typeof newSession>>['autosave'], data: unknown) {
  await vi.advanceTimersByTimeAsync(1000);
  autosave.schedule('tray', data);
  await vi.advanceTimersByTimeAsync(4000);
}

describe('unsaved work left with the account', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storage.clear();
    heldLocks.length = 0;
    server.docs.clear();
    server.writes.length = 0;
    server.deleted.length = 0;
    server.latencyMs = 0;
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    vi.stubGlobal('navigator', {
      locks: {
        query: async () => ({ held: [...heldLocks] }),
        request: async () => {},
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('offers work written while unsaved to the next session', async () => {
    const unsaved = { now: true };
    const first = await newSession(unsaved);
    await write(first.autosave, { edit: 1 });

    const { autosave } = await newSession({ now: false });
    expect(autosave.getStatus().draft?.name).toBe('tray');
  });

  it('offers nothing for a scene opened and left alone', async () => {
    const first = await newSession({ now: false });
    await write(first.autosave, { preset: 1 });

    const { autosave } = await newSession({ now: false });
    expect(autosave.getStatus().draft).toBeNull();
  });

  it('offers nothing once the work has been saved on purpose', async () => {
    const unsaved = { now: true };
    const first = await newSession(unsaved);
    await write(first.autosave, { edit: 1 });
    unsaved.now = false;
    await first.autosave.saveExplicit('tray', { edit: 1 }, 'Saved');

    const { autosave } = await newSession({ now: false });
    expect(autosave.getStatus().draft).toBeNull();
  });

  it('leaves work alone while the session that wrote it is still open in another tab', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });

    heldLocks.push({ name: 'etch_open_tab' });
    const { autosave } = await newSession({ now: false });
    expect(autosave.getStatus().draft).toBeNull();
  });

  it('does not let a new session write over the offer with a scene nobody touched', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });
    const writes = server.writes.length;

    const { autosave } = await newSession({ now: false });
    await write(autosave, { default: 'scene' });

    expect(server.writes.length).toBe(writes);
  });

  it('sends edits to a new document, so the offer can still be taken up', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });
    const draftId = first.autosave.getStatus().documentId!;

    const { autosave, restored } = await newSession({ now: true });
    await write(autosave, { other: 'work' });

    expect(autosave.getStatus().documentId).not.toBe(draftId);
    expect(server.docs.get(draftId)?.data).toEqual({ edit: 1 });
    expect(await autosave.restoreDraft()).toBe(true);
    expect(restored).toEqual([{ data: { edit: 1 }, name: 'tray' }]);
  });

  it('puts the work back and carries on writing to its document', async () => {
    const unsaved = { now: true };
    const first = await newSession(unsaved);
    await write(first.autosave, { edit: 1 });
    const draftId = first.autosave.getStatus().documentId!;

    const { autosave, restored } = await newSession(unsaved);
    expect(await autosave.restoreDraft()).toBe(true);
    expect(restored[0].data).toEqual({ edit: 1 });
    expect(autosave.getStatus().draft).toBeNull();

    await write(autosave, { edit: 2 });
    expect(server.writes.at(-1)).toMatchObject({ id: draftId, data: { edit: 2 } });
  });

  it('keeps the offer when the work cannot be fetched', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });
    const draftId = first.autosave.getStatus().documentId!;

    const { autosave } = await newSession({ now: false });
    server.docs.delete(draftId);
    expect(await autosave.restoreDraft()).toBe(false);
    expect(autosave.getStatus().draft).not.toBeNull();
  });

  it('lets the work go when dismissed, and saving resumes', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });

    const unsaved = { now: false };
    const { autosave } = await newSession(unsaved);
    autosave.schedule('Untitled', { default: 'scene' });
    await vi.advanceTimersByTimeAsync(4000);
    autosave.dismissDraft();
    await vi.advanceTimersByTimeAsync(100);
    const next = await newSession({ now: false });
    expect(next.autosave.getStatus().draft).toBeNull();

    unsaved.now = true;
    await write(autosave, { default: 'scene', edited: true });
    expect(server.writes.at(-1)?.data).toEqual({ default: 'scene', edited: true });
  });

  it('never writes a scene opened and left alone', async () => {
    const { autosave } = await newSession({ now: false });
    const states: string[] = [];
    autosave.subscribe((s) => states.push(s.state));
    await write(autosave, { preset: 'hotel keychain' });

    expect(server.writes).toEqual([]);
    expect(states).not.toContain('saving');
  });

  it('withdraws the offer when an edit is undone back to the clean point', async () => {
    const unsaved = { now: true };
    const first = await newSession(unsaved);
    await write(first.autosave, { edit: 1 });
    unsaved.now = false;
    await write(first.autosave, { preset: 1 });

    const { autosave } = await newSession({ now: false });
    expect(autosave.getStatus().draft).toBeNull();
  });

  it('deletes the older draft once a newer one replaces it', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });
    const older = first.autosave.getStatus().documentId!;

    const second = await newSession({ now: true });
    await write(second.autosave, { other: 'work' });
    const newer = second.autosave.getStatus().documentId!;

    const third = await newSession({ now: false });
    expect(third.autosave.getStatus().draft?.documentId).toBe(newer);
    expect(server.deleted).toEqual([older]);
  });

  it('forgets an offer a week old', async () => {
    const first = await newSession({ now: true });
    await write(first.autosave, { edit: 1 });

    await vi.advanceTimersByTimeAsync(8 * 24 * 60 * 60 * 1000);
    const { autosave } = await newSession({ now: false });
    expect(autosave.getStatus().draft).toBeNull();
  });
});

describe('writes that overlap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storage.clear();
    server.docs.clear();
    server.writes.length = 0;
    server.latencyMs = 0;
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not take a save during an autosave for a change on another device', async () => {
    const { autosave } = await newSession({ now: true });
    await write(autosave, { edit: 1 });

    server.latencyMs = 200;
    await vi.advanceTimersByTimeAsync(1000);
    autosave.schedule('tray', { edit: 2 });
    void autosave.flush();
    await vi.advanceTimersByTimeAsync(50);
    void autosave.saveExplicit('tray', { edit: 2, named: true }, 'Saved');
    await vi.advanceTimersByTimeAsync(1000);

    expect(autosave.getStatus().state).toBe('saved');
    expect(server.writes.at(-1)?.data).toEqual({ edit: 2, named: true });
  });

  it('keeps an edit made during a deliberate save', async () => {
    const { autosave } = await newSession({ now: true });
    await write(autosave, { edit: 1 });

    server.latencyMs = 200;
    await vi.advanceTimersByTimeAsync(1000);
    void autosave.saveExplicit('tray', { edit: 2 }, 'Saved');
    await vi.advanceTimersByTimeAsync(50);
    autosave.schedule('tray', { edit: 3 });
    await vi.advanceTimersByTimeAsync(5000);

    expect(server.writes.at(-1)?.data).toEqual({ edit: 3 });
  });

  it('sends what is on screen when a conflict is resolved, not what it stopped on', async () => {
    const { autosave } = await newSession({ now: true });
    await write(autosave, { edit: 1 });
    const id = autosave.getStatus().documentId!;

    server.docs.set(id, { revision: 99, data: { theirs: true } });
    await write(autosave, { edit: 2 });
    expect(autosave.getStatus().state).toBe('conflict');

    await vi.advanceTimersByTimeAsync(1000);
    autosave.schedule('tray', { edit: 3 });
    await autosave.keepLocalCopy();

    expect(server.writes.at(-1)?.data).toEqual({ edit: 3 });
    expect(autosave.holdsLatest()).toBe(true);
  });
});

describe('what each app hands the engine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storage.clear();
    heldLocks.length = 0;
    server.docs.clear();
    server.writes.length = 0;
    server.latencyMs = 0;
    vi.stubGlobal('window', { addEventListener: () => {} });
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    vi.stubGlobal('navigator', { locks: { query: async () => ({ held: [] }), request: async () => {} } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the storage keys each app had before the engine was shared', async () => {
    // A renamed key would orphan the document a browser was writing to.
    storage.set('etch_cloud_document_id', 'doc_existing');
    const { autosave } = await newSession({ now: true });
    expect(autosave.getStatus().documentId).toBe('doc_existing');
    await write(autosave, { edit: 1 });
    expect(server.writes.at(-1)?.id).toBe('doc_existing');
    expect(JSON.parse(storage.get('etch_cloud_draft')!).documentId).toBe('doc_existing');
  });

  it('sends the app’s form of the document, and restores through its reader', async () => {
    const first = await newSession({ now: true }, {
      toCloud: async (data) => ({ packed: data }),
    });
    await write(first.autosave, { edit: 1 });
    expect(server.writes.at(-1)?.data).toEqual({ packed: { edit: 1 } });

    const { autosave, restored } = await newSession({ now: false }, {
      fromCloud: async (doc) => (doc.data as { packed: unknown }).packed,
    });
    expect(await autosave.restoreDraft()).toBe(true);
    expect(restored[0].data).toEqual({ edit: 1 });
  });

  it('saves the document whole when the app’s step fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { autosave } = await newSession({ now: true }, {
      toCloud: async () => { throw new Error('blob store down'); },
    });
    await write(autosave, { edit: 1 });
    expect(server.writes.at(-1)?.data).toEqual({ edit: 1 });
  });

  it('retries a refusal the app says it has put right', async () => {
    const recovered: string[] = [];
    const { autosave } = await newSession({ now: true }, {
      recoverable: (err) => {
        if (err.code !== 'blobs_missing') return false;
        recovered.push(err.code);
        return true;
      },
    });
    const put = api.putCloudDocument;
    let once = true;
    api.putCloudDocument = async (input) => {
      if (once) { once = false; throw new FakeApiError(400, { code: 'blobs_missing' }); }
      return put(input);
    };
    try {
      await write(autosave, { edit: 1 });
      expect(recovered).toEqual(['blobs_missing']);
      expect(autosave.getStatus().state).toBe('offline');
      await vi.advanceTimersByTimeAsync(6000);
      expect(autosave.getStatus().state).toBe('saved');
      expect(server.writes.at(-1)?.data).toEqual({ edit: 1 });
    } finally {
      api.putCloudDocument = put;
    }
  });

  it('refuses a document bigger than the account takes, and resumes once it is not', async () => {
    const { autosave } = await newSession({ now: true });
    await vi.advanceTimersByTimeAsync(1000);
    autosave.schedule('relief', { verts: 'v'.repeat(40 * 1024 * 1024) });
    await vi.advanceTimersByTimeAsync(300000);
    expect(server.writes).toEqual([]);
    expect(autosave.getStatus().message).toMatch(/Too big to sync \(40\.0 MB/);

    autosave.schedule('relief', { verts: 'small' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(server.writes.at(-1)?.data).toEqual({ verts: 'small' });
  });

  it('measures only what travels with the document', async () => {
    const { autosave } = await newSession({ now: true }, {
      externalizableChars: () => 39 * 1024 * 1024,
    });
    await write(autosave, { verts: 'v'.repeat(40 * 1024 * 1024) });
    await vi.advanceTimersByTimeAsync(30000);
    expect(server.writes).toHaveLength(1);
  });

  it('remembers what the open document is called, signed in or not', async () => {
    const { autosave } = await newSession({ now: false });
    autosave.schedule('Blinky', { circuit: 1 });
    expect(autosave.getDocumentName()).toBe('Blinky');
  });
});
