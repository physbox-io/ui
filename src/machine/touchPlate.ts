import { SUITE_KEYS, readSuiteValue, writeSyncedSuiteValue } from '../suite/suiteCookie';

/**
 * The touch plate and the hand-zeroing shim: one machine, one bench, so one
 * figure in every app. Shared through the suite cookie and the account.
 */

export const DEFAULT_TOUCH_PLATE_MM = 12;
export const MAX_TOUCH_PLATE_MM = 100;
/** Copier paper: wind the tool down until the sheet just drags. */
export const DEFAULT_SHIM_MM = 0.1;
/** Anything thicker than this is not a shim, it is a touch plate. */
export const MAX_SHIM_MM = 10;

function clamp(value: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.min(max, value);
}

export const clampTouchPlateMm = (mm: number): number => clamp(mm, MAX_TOUCH_PLATE_MM, DEFAULT_TOUCH_PLATE_MM);
export const clampShimMm = (mm: number): number => clamp(mm, MAX_SHIM_MM, DEFAULT_SHIM_MM);

function readMm(key: string, legacy: readonly string[], fallback: number, clampFn: (n: number) => number): number {
  const raw = readSuiteValue(key, legacy);
  if (raw === null || raw.trim() === '') return fallback;
  return clampFn(Number(raw));
}

/** Every key the three apps used before the plate was shared. */
const LEGACY_PLATE_KEYS = ['etch_touch_sensor_height_mm', 'grblTouchPlateMm', 'meshTouchPlateMm'];
const LEGACY_SHIM_KEYS = ['etch_manual_z_shim_thickness_mm', 'meshZeroShimMm'];

export function readTouchPlateMm(): number {
  return readMm(SUITE_KEYS.touchPlateMm, LEGACY_PLATE_KEYS, DEFAULT_TOUCH_PLATE_MM, clampTouchPlateMm);
}

/** Stores the plate and returns what was stored, clamped. */
export function setTouchPlateMm(mm: number): number {
  const v = clampTouchPlateMm(mm);
  writeSyncedSuiteValue(SUITE_KEYS.touchPlateMm, String(v));
  return v;
}

export function readShimMm(): number {
  return readMm(SUITE_KEYS.shimMm, LEGACY_SHIM_KEYS, DEFAULT_SHIM_MM, clampShimMm);
}

export function setShimMm(mm: number): number {
  const v = clampShimMm(mm);
  writeSyncedSuiteValue(SUITE_KEYS.shimMm, String(v));
  return v;
}

// ---------------------------------------------------------------------------
// How the machine is reached
// ---------------------------------------------------------------------------

export type MachineLinkKind = 'usb' | 'cloud';

export interface MachineLink {
  kind: MachineLinkKind;
  /** The Tekno Box, when the link is the cloud. */
  deviceId: string | null;
}

/** Etch and Volt called the cloud link 'wifi'. */
const LEGACY_LINK_KEYS = ['etchTransport', 'grblTransport', 'physbox.machineLink'];
const LEGACY_DEVICE_KEYS = ['etchCloudDeviceId', 'grblCloudDeviceId', 'physbox.cloudDeviceId'];

export function readMachineLink(): MachineLink {
  const kind = readSuiteValue(SUITE_KEYS.machineLink, LEGACY_LINK_KEYS);
  const deviceId = readSuiteValue(SUITE_KEYS.cloudDeviceId, LEGACY_DEVICE_KEYS);
  return {
    kind: kind === 'cloud' || kind === 'wifi' ? 'cloud' : 'usb',
    deviceId: deviceId || null,
  };
}

export function setMachineLink(link: Partial<MachineLink>): void {
  if (link.kind) writeSyncedSuiteValue(SUITE_KEYS.machineLink, link.kind);
  if (link.deviceId !== undefined) writeSyncedSuiteValue(SUITE_KEYS.cloudDeviceId, link.deviceId ?? '');
}
