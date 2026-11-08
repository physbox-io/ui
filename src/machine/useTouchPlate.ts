import { useSyncExternalStore } from 'react';
import { subscribeSuiteCookies } from '../suite/suiteCookie';
import { DEFAULT_SHIM_MM, DEFAULT_TOUCH_PLATE_MM, readMachineLink, readShimMm, readTouchPlateMm, type MachineLink } from './touchPlate';

export function useTouchPlateMm(): number {
  return useSyncExternalStore(subscribeSuiteCookies, readTouchPlateMm, () => DEFAULT_TOUCH_PLATE_MM);
}

export function useShimMm(): number {
  return useSyncExternalStore(subscribeSuiteCookies, readShimMm, () => DEFAULT_SHIM_MM);
}

let linkCache: MachineLink = { kind: 'usb', deviceId: null };
function linkSnapshot(): MachineLink {
  const next = readMachineLink();
  if (next.kind !== linkCache.kind || next.deviceId !== linkCache.deviceId) linkCache = next;
  return linkCache;
}

export function useMachineLink(): MachineLink {
  return useSyncExternalStore(subscribeSuiteCookies, linkSnapshot, linkSnapshot);
}
