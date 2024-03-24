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
  del(key: string): void;
  clear(): void;
  keys(): string[];
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
    let data$ = this.data.get(key);
    if (!data$) {
      data$ = new LiveData<any>(null);
      this.data.set(key, data$);
    }
    return data$;
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
  keys(): string[] {
    return Array.from(this.data.keys());
  }
  clear(): void {
    this.data.clear();
  }
  del(key: string): void {
    this.data.delete(key);
  }
}

export function wrapMemento(memento: Memento, prefix: string): Memento {
  return {
    get<T>(key: string): T | null {
      return memento.get(prefix + key);
    },
    watch(key: string) {
      return memento.watch(prefix + key);
    },
    set<T>(key: string, value: T | null): void {
      memento.set(prefix + key, value);
    },
    keys(): string[] {
      return memento
        .keys()
        .filter(k => k.startsWith(prefix))
        .map(k => k.slice(prefix.length));
    },
    clear() {
      memento.keys().forEach(k => {
        if (k.startsWith(prefix)) {
          memento.del(k);
        }
      });
    },
    del(key: string): void {
      memento.del(prefix + key);
    },
  };
}
