import {
  type AsyncMemento,
  createIdentifier,
  type Memento,
} from '@toeverything/infra';

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

/**
 * A memento object that stores session state.
 *
 * Session state is not persisted, it will be cleared when the application is closed. (thinking about sessionStorage)
 */
export interface GlobalSessionState extends Memento {}
export const GlobalSessionState =
  createIdentifier<GlobalSessionState>('GlobalSessionState');

export interface CacheStorage extends AsyncMemento {}

export const CacheStorage = createIdentifier<CacheStorage>('CacheStorage');
