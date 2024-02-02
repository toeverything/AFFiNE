import type { Observable } from 'rxjs';

import { createIdentifier } from '../di';
import { LiveData } from '../livedata';

/**
 * A memento represents a storage utility. It can store and retrieve values, and observe changes.
 */
export interface Memento {
  get<T>(key: string): T | null;
  watch<T>(key: string): Observable<T | null>;
  set<T>(key: string, value: T | null): void;
}

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
 * A simple implementation of Memento. Used for testing.
 */
export class MemoryMemento implements Memento {
  private readonly data = new Map<string, LiveData<any>>();

  private getLiveData(key: string): LiveData<any> {
    let data = this.data.get(key);
    if (!data) {
      data = new LiveData<any>(null);
      this.data.set(key, data);
    }
    return data;
  }

  get<T>(key: string): T | null {
    return this.getLiveData(key).value;
  }
  watch<T>(key: string): Observable<T | null> {
    return this.getLiveData(key).asObservable();
  }
  set<T>(key: string, value: T | null): void {
    this.getLiveData(key).next(value);
  }
}
