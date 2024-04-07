import { createIdentifier } from '../../../framework';
import type { Memento } from '../../../storage';

/**
 * A memento object that stores the entire application state.
 *
 * State is persisted, even the application is closed.
 */
export interface GlobalState extends Memento {}

export const GlobalState = createIdentifier<GlobalState>('GlobalState');

/**
 * A memento object that stores the entire application cache.
 *
 * Cache may be deleted from time to time, business logic should not rely on cache.
 */
export interface GlobalCache extends Memento {}

export const GlobalCache = createIdentifier<GlobalCache>('GlobalCache');
