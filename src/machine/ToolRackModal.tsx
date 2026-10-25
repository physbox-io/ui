import React, { useState } from 'react';
import { Wrench, Plus, Trash2, RotateCcw, X, Check, ShieldCheck, AlertTriangle, Info } from 'lucide-react';
import { NumberInput } from '../NumberInput';

/**
 * A rack tool, mirrored from `@physbox-io/machining`'s `RackTool` so this
 * package does not depend on that one. The modal is generic over the app's own
 * type, so fields it does not know about pass through an edit untouched.
 */
export interface RackToolLike {
  uid: string;
  toolNumber: number;
  name: string;
  shape: 'flat' | 'ball' | 'vbit' | 'drill';
  diameterMm: number;
  tipAngleDeg?: number;
  flutes?: number;
  centerCutting?: boolean;
  feedDiameterMm?: number;
  maxStepdownRatio?: number;
  maxStepdownMm?: number;
  maxStepoverRatio?: number;
  maxPlungeRate?: number;
  rpm?: number;
  available: boolean;
  notes?: string;
  bestFor?: string[];
  guidance?: string;
  minDetailMm?: number;
}

/** A preset as `@physbox-io/machining`'s `RACK_PRESETS` lists it. */
export interface RackPresetLike {
  category: string;
  label: string;
  tool: Omit<RackToolLike, 'uid' | 'toolNumber' | 'available'>;
}

/** The cutting limits an app would derive for a tool that carries none. */
export interface RackCuttingDefaults {
  flutes?: number;
  centerCutting?: boolean;
  maxStepdownRatio?: number;
  maxStepoverRatio?: number;
  maxPlungeRate?: number;
}

export interface ToolRackModalProps<T extends RackToolLike> {
  open: boolean;
  onClose: () => void;
  tools: T[];
  onChange: (tools: T[]) => void;
  /** Restores the starting rack. Asked twice before it is called. */
  onReset: () => void;
  /** How many tools the starting rack holds, for the reset confirmation. */
  defaultCount?: number;
  presets: RackPresetLike[];
  /** The "best suited for" choices, in the app's own words. Omitted, the section is hidden. */
  uses?: { id: string; label: string }[];
  /** What in the open document is cut with this T number, so a delete can say what it orphans. */
  usedBy?: (toolNumber: number) => string[];
  /** The last edit did not reach storage. */
  unsaved?: boolean;
  /** A line under the title, e.g. that the rack is shared with the other apps. */
  note?: React.ReactNode;
  /**
   * The limits the app falls back to for a field left blank — pass
   * `cuttingDefaults` from `@physbox-io/machining`. Shown as the placeholder, so
   * a blank field says what will actually be used rather than looking unset.
   */
  cuttingDefaults?: (tool: Pick<RackToolLike, 'shape' | 'diameterMm'>) => RackCuttingDefaults;
  title?: string;
}

/*
 * Mirrors of `@physbox-io/machining`'s tool geometry, which this package cannot
 * import. They drive only what the editor previews — the planners use the
 * machining copies — but they must agree with them or the preview lies.
 */

/**
 * Widest included angle a tapered tool may be given. At 180° the flanks are
 * flat and the groove is infinitely wide; past it the tool "cuts" narrower the
 * deeper it goes. Neither is a tool; both are what a number field lets someone
 * type.
 */
export const RACK_MAX_TIP_ANGLE_DEG = 179;
const NOMINAL_VBIT_DEPTH_MM = 1.5;

function clampTipAngle(angle: number | undefined): number | undefined {
  if (angle === undefined || !Number.isFinite(angle) || angle <= 0) return undefined;
  return Math.min(angle, RACK_MAX_TIP_ANGLE_DEG);
}

function cutWidthAtDepth(tool: RackToolLike, depthMm: number): number {
  const tip = tool.diameterMm ?? 0;
  const angle = clampTipAngle(tool.tipAngleDeg);
  if (!angle) return tip;
  return tip + 2 * Math.max(0, depthMm) * Math.tan((angle * Math.PI) / 360);
}

/** What feeds will assume is engaged when the engaged-width field is blank. */
function defaultFeedDiameter(tool: RackToolLike): number {
  if (!clampTipAngle(tool.tipAngleDeg)) return tool.diameterMm;
  return Math.max(tool.diameterMm ?? 0, cutWidthAtDepth(tool, NOMINAL_VBIT_DEPTH_MM));
}

/**
 * "Tool rack T1–T6", for whatever the rack actually holds. The numbers are not
 * necessarily 1..n: a deleted slot leaves a gap, and new slots are appended
 * above the highest rather than filling it.
 */
export function rackLabel(tools: Pick<RackToolLike, 'toolNumber'>[]): string {
  if (tools.length === 0) return 'No tools';
  const ids = tools.map((t) => t.toolNumber);
  const lo = Math.min(...ids);
  const hi = Math.max(...ids);
  return lo === hi ? `Tool rack T${lo}` : `Tool rack T${lo}–T${hi}`;
}

const SHAPES: { id: RackToolLike['shape']; label: string }[] = [
  { id: 'flat', label: 'Flat end mill' },
  { id: 'ball', label: 'Ball nose' },
  { id: 'vbit', label: 'V-bit' },
  { id: 'drill', label: 'Drill' },
];

function shapeLine(tool: RackToolLike): string {
  switch (tool.shape) {
    case 'vbit':
      return `${tool.tipAngleDeg ?? '?'}° V-Bit`;
    case 'ball':
      return `${tool.diameterMm ?? 0} mm Ball`;
    case 'drill':
      return `${tool.diameterMm ?? 0} mm Drill`;
    default:
      return `${tool.diameterMm ?? 0} mm Flat`;
  }
}

/** A small (i) with the explanation on hover, for the parameters nobody guesses. */
function Hint({ text }: { text: string }) {
  return (
    <span
      className="inline-flex items-center group relative cursor-help align-middle text-slate-400 dark:text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 transition-colors"
      title={text}
    >
      <Info className="w-3 h-3 shrink-0" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-48 p-1.5 bg-slate-900 dark:bg-slate-800 text-slate-100 text-[10px] leading-tight rounded-md shadow-xl border border-slate-700 z-50 normal-case font-normal font-sans text-center tracking-normal">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-800" />
      </span>
    </span>
  );
}

const LABEL = 'block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1';
const TEXT_INPUT =
  'w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none';
const NUM_INPUT =
  'w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-mono text-right focus:ring-2 focus:ring-amber-500 outline-none';

function newUid(): string {
  return `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The cutters in the drawer, edited the same way in every app.
 *
 * Ported from Etch's tool library dialog when the rack became shared. Retiring
 * a bit is unticking "Enable" rather than a delete, because a document cut with
 * it last month still names it: it stays listed, dimmed, and no app offers it
 * for a new job.
 */
export function ToolRackModal<T extends RackToolLike>({
  open,
  onClose,
  tools,
  onChange,
  onReset,
  defaultCount,
  presets,
  uses,
  usedBy,
  unsaved,
  note,
  cuttingDefaults,
  title = 'CNC Tool Library Configuration',
}: ToolRackModalProps<T>) {
  const sorted = [...tools].sort((a, b) => a.toolNumber - b.toolNumber);
  const [activeUid, setActiveUid] = useState<string | null>(sorted[0]?.uid ?? null);
  const [showPresetDropdown, setShowPresetDropdown] = useState(false);
  /** A delete or reset waiting on a second click, rather than a browser dialog. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState(false);

  if (!open) return null;

  /** Closing drops any half-answered confirm, so reopening starts clean. */
  const handleClose = () => {
    setPendingDelete(null);
    setPendingReset(false);
    setShowPresetDropdown(false);
    onClose();
  };

  const selectedTool = sorted.find((t) => t.uid === activeUid) ?? sorted[0];
  const derived = selectedTool && cuttingDefaults ? cuttingDefaults(selectedTool) : undefined;

  const updateTool = (uid: string, patch: Partial<RackToolLike>) =>
    onChange(tools.map((t) => (t.uid === uid ? ({ ...t, ...patch } as T) : t)));

  const updateSelectedTool = (patch: Partial<RackToolLike>) => {
    if (selectedTool) updateTool(selectedTool.uid, patch);
  };

  /**
   * A tool must be good for something.
   *
   * An empty `bestFor` is not "suited to nothing", it is a profile that warns
   * on every layer it is ever put on, so the last checked box is held down
   * rather than silently rewritten to the first use — which would be this
   * dialog changing a spec the operator did not change. Uses this app does not
   * know are kept: another app sharing the rack wrote them.
   */
  const toggleBestFor = (use: string) => {
    if (!selectedTool || !uses) return;
    const current = selectedTool.bestFor ?? [];
    const known = current.filter((u) => uses.some((x) => x.id === u));
    if (known.includes(use) && known.length === 1) return;
    const next = current.includes(use) ? current.filter((u) => u !== use) : [...current, use];
    updateSelectedTool({ bestFor: next });
  };

  /** A preset fills the slot; the slot keeps its identity, number, availability and notes. */
  const handleApplyPreset = (label: string) => {
    const preset = presets.find((p) => p.label === label);
    if (!preset || !selectedTool) return;
    const { uid, toolNumber, available, notes } = selectedTool;
    const filled = {
      ...preset.tool,
      bestFor: preset.tool.bestFor ? [...preset.tool.bestFor] : undefined,
      uid,
      toolNumber,
      available,
      notes,
    };
    onChange(tools.map((t) => (t.uid === uid ? (filled as T) : t)));
    setShowPresetDropdown(false);
  };

  /**
   * New slots take the next number up, never a freed one.
   *
   * Reusing the lowest gap silently repoints every document still carrying
   * that T number at a different cutter — a layer drawn for the 60° V-bit in
   * T3 would come back as a 3 mm end mill, at the V-bit's depth, with nothing
   * saying so.
   */
  const handleAddTool = () => {
    const nextNumber = tools.reduce((max, t) => Math.max(max, t.toolNumber), 0) + 1;
    const newTool = {
      uid: newUid(),
      toolNumber: nextNumber,
      name: `Tool T${nextNumber} (3.175 mm)`,
      shape: 'flat',
      diameterMm: 3.175,
      bestFor: uses?.[0] ? [uses[0].id] : undefined,
      guidance: 'Custom tool profile.',
      minDetailMm: 3.175,
      flutes: 2,
      centerCutting: true,
      maxStepdownRatio: 1.0,
      maxStepoverRatio: 0.45,
      maxPlungeRate: 400,
      available: true,
    } satisfies RackToolLike;
    onChange([...tools, newTool as T]);
    setActiveUid(newTool.uid);
  };

  const handleDeleteTool = (uid: string) => {
    if (tools.length <= 1) return;
    const updated = tools.filter((t) => t.uid !== uid);
    onChange(updated);
    setPendingDelete(null);
    if (activeUid === uid) setActiveUid([...updated].sort((a, b) => a.toolNumber - b.toolNumber)[0].uid);
  };

  const handleResetAll = () => {
    onReset();
    setActiveUid(null);
    setPendingReset(false);
  };

  /**
   * The shape decides what the angle means. A V-bit with no angle is a 0.1 mm
   * end mill to every planner, so choosing one supplies a common angle, and
   * leaving one drops the angle rather than keeping a taper on a parallel tool.
   */
  const setShape = (shape: RackToolLike['shape']) => {
    if (!selectedTool) return;
    updateSelectedTool({
      shape,
      tipAngleDeg: shape === 'vbit' ? (selectedTool.tipAngleDeg ?? 60) : undefined,
      feedDiameterMm: undefined,
    });
  };

  const categories = Array.from(new Set(presets.map((p) => p.category)));
  const derivedFeedDiameter = selectedTool ? defaultFeedDiameter(selectedTool) : undefined;
  const auto = (v: number | undefined, unit = '') => (v !== undefined ? `Auto — ${v}${unit}` : 'Auto');

  const flutes = selectedTool?.flutes ?? derived?.flutes ?? 2;
  const plunge = selectedTool?.maxPlungeRate ?? derived?.maxPlungeRate ?? 300;
  const stepover = selectedTool?.maxStepoverRatio ?? derived?.maxStepoverRatio ?? 0.45;
  const centerCutting = selectedTool?.centerCutting ?? derived?.centerCutting ?? true;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 font-sans">
                {title}
                <span className="text-[10px] uppercase tracking-wider font-mono px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  {rackLabel(tools)}
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize cutter diameters, flutes, stepdown limits &amp; speeds for each tool slot
              </p>
              {note && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{note}</p>}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Tool slots */}
          <div className="w-56 border-r border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/40 p-3 flex flex-col gap-1.5 overflow-y-auto">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2 py-1 flex items-center justify-between">
              <span>Tool Slots</span>
              <span>{tools.length} Loaded</span>
            </div>

            {/*
              A row is a div rather than a button, because it contains the
              delete button and the availability box: a control inside a button
              is invalid markup, and which of the two a click reaches is left to
              the browser.
            */}
            {sorted.map((tool) => {
              const isActive = tool.uid === selectedTool?.uid;
              const inUse = usedBy ? usedBy(tool.toolNumber) : [];
              const retired = tool.available === false;
              const select = () => {
                setActiveUid(tool.uid);
                setShowPresetDropdown(false);
              };
              return (
                <div key={tool.uid}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={select}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select();
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition-all flex items-center justify-between group cursor-pointer ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-300 font-bold shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800/80 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                    } ${retired ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-mono text-[11px] font-bold shrink-0 text-slate-700 dark:text-slate-300">
                        T{tool.toolNumber}
                      </span>
                      <div className="truncate">
                        <div className="truncate text-xs font-semibold">{tool.name}</div>
                        <div className="text-[10px] opacity-75 font-mono">
                          {shapeLine(tool)}
                          {retired && ' · retired'}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <label
                        className="flex items-center gap-0.5 text-[9px] font-semibold text-slate-500 dark:text-slate-400 cursor-pointer"
                        title={
                          retired
                            ? `T${tool.toolNumber} is retired: still listed, not offered for new jobs`
                            : `T${tool.toolNumber} is enabled and offered for new jobs. Untick to retire it without deleting it`
                        }
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={!retired}
                          onChange={(e) => updateTool(tool.uid, { available: e.target.checked })}
                          className="accent-amber-500 cursor-pointer w-3 h-3"
                        />
                        <span>Enable</span>
                      </label>
                      {tools.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDelete((cur) => (cur === tool.uid ? null : tool.uid));
                          }}
                          className={`p-1 hover:text-red-500 transition-opacity cursor-pointer ${
                            pendingDelete === tool.uid ? 'opacity-100 text-red-500' : 'opacity-0 group-hover:opacity-100'
                          }`}
                          title={`Remove T${tool.toolNumber}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Deleting a slot a document is cut with leaves it pointing
                      at a tool the rack no longer knows, so say so before it
                      happens rather than after the export. */}
                  {pendingDelete === tool.uid && (
                    <div className="mt-1 mb-1 p-2 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-[10px] text-red-800 dark:text-red-200 space-y-1.5">
                      <div>
                        Remove T{tool.toolNumber}?
                        {inUse.length > 0 && (
                          <>
                            {' '}
                            {inUse.length} layer{inUse.length === 1 ? '' : 's'} ({inUse.join(', ')}) still cut with it,
                            and will fall back to an uncatalogued T{tool.toolNumber}.
                          </>
                        )}
                        {!retired && ' Untick "Enable" instead to keep it listed but stop offering it.'}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => handleDeleteTool(tool.uid)}
                          className="px-2 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
                        >
                          Remove
                        </button>
                        <button
                          onClick={() => setPendingDelete(null)}
                          className="px-2 py-0.5 rounded border border-red-300 dark:border-red-800 font-semibold cursor-pointer"
                        >
                          Keep
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button
              onClick={handleAddTool}
              className="mt-2 w-full py-2 px-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Tool Slot</span>
            </button>
          </div>

          {/* Editor */}
          {selectedTool && (
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {/* The rack drives kerf compensation and feeds, so a browser that
                  refused to store it is not a quiet inconvenience — the operator
                  needs to know these numbers die with the tab. */}
              {unsaved && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-2 text-[11px] text-red-800 dark:text-red-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>
                    This rack could not be saved to browser storage — check that storage is not disabled or full. It
                    is in use for this session and will be exported correctly, but it will be gone when the page
                    reloads.
                  </span>
                </div>
              )}

              {/* Preset selector */}
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Configure Tool T{selectedTool.toolNumber} — {selectedTool.name}
                  </div>
                  <div className="text-[11px] text-amber-700 dark:text-amber-400">
                    Select a common shop profile to auto-fill specs, or edit the fields below manually.
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={() => setShowPresetDropdown((v) => !v)}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <span>Populate from Preset...</span>
                    <span>▾</span>
                  </button>

                  {showPresetDropdown && (
                    <div className="absolute right-0 top-full mt-1 w-72 max-h-80 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 p-2 text-xs space-y-2">
                      {categories.map((cat) => (
                        <div key={cat}>
                          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700">
                            {cat}
                          </div>
                          {presets
                            .filter((p) => p.category === cat)
                            .map((p) => (
                              <button
                                key={p.label}
                                onClick={() => handleApplyPreset(p.label)}
                                className="w-full text-left px-2 py-1.5 rounded hover:bg-amber-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-medium cursor-pointer"
                              >
                                {p.label}
                              </button>
                            ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Basic geometry */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Basic Geometry &amp; Description
                </h3>

                <div className="grid grid-cols-4 gap-4">
                  <div className="col-span-2">
                    <label className={LABEL}>Tool Name / Label</label>
                    <input
                      type="text"
                      value={selectedTool.name}
                      onChange={(e) => updateSelectedTool({ name: e.target.value })}
                      className={TEXT_INPUT}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Shape <Hint text="The end of the tool. A V-bit's width depends on depth; a ball nose leaves scallops; a drill only plunges." />
                    </label>
                    <select
                      value={selectedTool.shape}
                      onChange={(e) => setShape(e.target.value as RackToolLike['shape'])}
                      className={`${TEXT_INPUT} cursor-pointer`}
                    >
                      {SHAPES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={LABEL}>
                      Cutter Diameter (mm) <Hint text="Outer kerf width of tool. Used for kerf offset & feed rate physics." />
                    </label>
                    <NumberInput
                      step={0.05}
                      min={0.05}
                      fallbackOnBlur={3.175}
                      value={selectedTool.diameterMm ?? 3.175}
                      onChange={(val) => {
                        const d = val ?? 0.05;
                        updateSelectedTool({
                          diameterMm: d,
                          // A parallel cutter's finest detail is its own width; a
                          // V-bit's is its tip, which is not what this field is.
                          minDetailMm: selectedTool.shape === 'vbit' ? selectedTool.minDetailMm : d,
                        });
                      }}
                      className={NUM_INPUT}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>
                      Tip Angle (deg) <span className="text-slate-400 font-normal">(V-Bit)</span>{' '}
                      <Hint text="V-carving taper angle. 0° is flat endmill; 30°/60°/90° V-bits widen kerf dynamically with depth." />
                    </label>
                    <NumberInput
                      step={5}
                      min={0}
                      max={RACK_MAX_TIP_ANGLE_DEG}
                      allowEmpty
                      placeholder="Parallel (0°)"
                      value={selectedTool.tipAngleDeg}
                      onChange={(val) => {
                        const clamped = clampTipAngle(val);
                        // The engaged width was worked out for the old taper;
                        // kept, it would feed the new one as if nothing changed.
                        updateSelectedTool({
                          tipAngleDeg: clamped,
                          shape: clamped ? 'vbit' : selectedTool.shape === 'vbit' ? 'flat' : selectedTool.shape,
                          feedDiameterMm: undefined,
                        });
                      }}
                      className={NUM_INPUT}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Minimum Detail (mm) <Hint text="Smallest inner corner radius or narrow slot this tool can carve without over-cutting." />
                    </label>
                    <NumberInput
                      step={0.05}
                      min={0.01}
                      fallbackOnBlur={0.01}
                      value={selectedTool.minDetailMm ?? selectedTool.diameterMm}
                      onChange={(val) => updateSelectedTool({ minDetailMm: val ?? 0.01 })}
                      className={NUM_INPUT}
                    />
                  </div>

                  {uses && uses.length > 0 && (
                    <div>
                      <label className={LABEL}>Best Suited For</label>
                      <div className="flex items-center gap-3 pt-1.5 flex-wrap">
                        {uses.map((use) => (
                          <label key={use.id} className="flex items-center gap-1 text-xs cursor-pointer font-medium">
                            <input
                              type="checkbox"
                              checked={(selectedTool.bestFor ?? []).includes(use.id)}
                              onChange={() => toggleBestFor(use.id)}
                              className="accent-amber-500 rounded cursor-pointer"
                            />
                            <span>{use.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className={LABEL}>Operator Guidance &amp; Warnings</label>
                  <input
                    type="text"
                    value={selectedTool.guidance ?? ''}
                    onChange={(e) => updateSelectedTool({ guidance: e.target.value })}
                    className={TEXT_INPUT}
                  />
                </div>
              </div>

              {/* Cutting limits */}
              <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Feeds &amp; Pass Limits Physics
                </h3>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className={LABEL}>
                      Flute Count <Hint text="Number of cutting edges on bit. Multiplies chip load to determine overall feed rate." />
                    </label>
                    <NumberInput
                      min={1}
                      /*
                       * 16, and whole numbers only. Feeds multiply chip load by
                       * this to get the feed, so a silent 12 to 10 understates
                       * the feed by 17% — rubbing and burning rather than
                       * cutting — and without `integer` a typed 2.5 survived the
                       * blur and multiplied the feed directly. 12- and 16-flute
                       * finishers are ordinary tools.
                       */
                      max={16}
                      integer
                      allowEmpty
                      placeholder={auto(derived?.flutes)}
                      value={selectedTool.flutes}
                      onChange={(v) => updateSelectedTool({ flutes: v })}
                      className={NUM_INPUT}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Center Cutting? <Hint text="Center-cutting bits can plunge vertically straight into stock; non-center cutting bits require ramping." />
                    </label>
                    <label className="flex items-center gap-2 pt-1.5 cursor-pointer text-xs font-medium">
                      <input
                        type="checkbox"
                        checked={centerCutting}
                        onChange={(e) => updateSelectedTool({ centerCutting: e.target.checked })}
                        className="accent-amber-500 rounded cursor-pointer w-4 h-4"
                      />
                      <span>{centerCutting ? 'Yes (Can Plunge)' : 'No (Must Ramp)'}</span>
                    </label>
                  </div>

                  <div>
                    <label className={LABEL}>
                      Max Stepdown (× Dia) <Hint text="Max pass depth as a factor of tool diameter (e.g. 1.0 = 1x diameter depth per pass)." />
                    </label>
                    <NumberInput
                      step={0.1}
                      min={0.1}
                      max={3.0}
                      allowEmpty
                      placeholder={auto(derived?.maxStepdownRatio)}
                      value={selectedTool.maxStepdownRatio}
                      onChange={(val) => updateSelectedTool({ maxStepdownRatio: val })}
                      className={NUM_INPUT}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Max Plunge (mm/min) <Hint text="Maximum Z-axis downward feed rate when entering material vertically." />
                    </label>
                    <NumberInput
                      step={50}
                      min={10}
                      max={2000}
                      allowEmpty
                      placeholder={auto(derived?.maxPlungeRate)}
                      value={selectedTool.maxPlungeRate}
                      onChange={(val) => updateSelectedTool({ maxPlungeRate: val })}
                      className={NUM_INPUT}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={LABEL}>
                      Max Stepover Ratio (Pocket Clearing) <Hint text="Sideways tool overlap between adjacent passes during pocket clearing (0.45 = 45% tool diameter)." />
                    </label>
                    <NumberInput
                      step={0.05}
                      min={0.05}
                      max={0.9}
                      allowEmpty
                      placeholder={auto(derived?.maxStepoverRatio)}
                      value={selectedTool.maxStepoverRatio}
                      onChange={(val) => updateSelectedTool({ maxStepoverRatio: val })}
                      className={NUM_INPUT}
                    />
                  </div>

                  <div>
                    <label className={LABEL}>
                      Max Pass Depth (Absolute mm Cap) <Hint text="Absolute millimeter upper limit on depth per pass regardless of cutter diameter ratio." />
                    </label>
                    <NumberInput
                      step={0.5}
                      min={0.1}
                      allowEmpty
                      placeholder="No hard cap"
                      value={selectedTool.maxStepdownMm}
                      onChange={(val) => updateSelectedTool({ maxStepdownMm: val })}
                      className={NUM_INPUT}
                    />
                  </div>

                  {/* Feeds come from this width, not from the geometric
                      diameter — for a V-bit those differ by an order of
                      magnitude, and getting it wrong is an hour of rubbing
                      instead of ten minutes of cutting. */}
                  <div>
                    <label className={LABEL}>
                      Engaged Width for Feeds (mm) <Hint text="Effective cutting width used to calculate chip load & feeds. Essential for tapered V-bits where width changes with depth." />
                    </label>
                    <NumberInput
                      step={0.1}
                      min={0.05}
                      allowEmpty
                      placeholder={
                        derivedFeedDiameter !== undefined ? `Auto — ${derivedFeedDiameter.toFixed(2)} mm` : 'Auto'
                      }
                      value={selectedTool.feedDiameterMm}
                      onChange={(val) => updateSelectedTool({ feedDiameterMm: val })}
                      className={NUM_INPUT}
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs font-mono">
                <div className="space-y-1">
                  <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>Cut Width @ 1 mm Depth:</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      {cutWidthAtDepth(selectedTool, 1.0).toFixed(2)} mm
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                    {clampTipAngle(selectedTool.tipAngleDeg)
                      ? 'Tapered V-Bit: width increases dynamically with Z depth'
                      : `Straight Cutter: constant ${selectedTool.diameterMm ?? 0} mm kerf width`}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-slate-700 dark:text-slate-300 font-semibold">
                    {flutes} Flute(s) · {plunge} mm/min Plunge
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                    Stepover: {(stepover * 100).toFixed(0)}% dia
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-center justify-between text-xs">
          {pendingReset ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-600 dark:text-slate-300">
                Discard the whole rack and restore the{defaultCount !== undefined ? ` ${defaultCount}` : ''} shop
                defaults?
              </span>
              <button
                onClick={handleResetAll}
                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold cursor-pointer"
              >
                Reset
              </button>
              <button
                onClick={() => setPendingReset(false)}
                className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setPendingReset(true)}
              className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset All to Defaults</span>
            </button>
          )}

          <button
            onClick={handleClose}
            className="px-5 py-2 font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg shadow-sm transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>Done</span>
          </button>
        </div>
      </div>
    </div>
  );
}
