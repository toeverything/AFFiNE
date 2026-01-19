import { atom } from 'jotai';

/**
 * Global state atom that tracks the system's power source.
 * @default false (Assumes AC power initially)
 */
export const isOnBatteryAtom = atom<boolean>(false);
