import { useSyncExternalStore } from 'react';

type Listener = () => void;

let snapshot = false;
let teardown: (() => void) | null = null;
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach(listener => listener());
}

function handlePowerSourceChange(isOnBattery: boolean) {
  if (snapshot === isOnBattery) return;
  snapshot = isOnBattery;
  emitChange();
}

function ensureSubscribed() {
  if (teardown) return;
  if (typeof window === 'undefined') return;

  const subscribePowerSource = window.__apis?.events?.power?.['power-source'];
  if (typeof subscribePowerSource !== 'function') return;

  const unsubscribe = subscribePowerSource(handlePowerSourceChange);
  teardown = typeof unsubscribe === 'function' ? unsubscribe : null;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    ensureSubscribed();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      teardown?.();
      teardown = null;
    }
  };
}

export function setupPowerSourceStore() {
  ensureSubscribed();
}

export function getIsOnBatterySnapshot() {
  return snapshot;
}

export function useIsOnBattery() {
  return useSyncExternalStore(subscribe, getIsOnBatterySnapshot, () => false);
}
