import type { Observable } from 'rxjs';

import { LiveData } from '../livedata';

/**
 * A memento represents a storage utility. It can store and retrieve values, and observe changes.
 */
export interface Memento {
  get<T>(key: string): T | undefined;
  watch<T>(key: string): Observable<T | undefined>;
  set<T>(key: string, value: T | undefined): void;
  del(key: string): void;
  clear(): void;
  keys(): string[];
}

/**
 * A simple implementation of Memento. Used for testing.
 */
export class MemoryMemento implements Memento {
  private readonly data = new Map<string, LiveData<any>>();

  setAll(init: Record<string, any>) {
    for (const [key, value] of Object.entries(init)) {
      this.set(key, value);
    }
  }

  private getLiveData(key: string): LiveData<any> {
    let data$ = this.data.get(key);
    if (!data$) {
      data$ = new LiveData<any>(undefined);
      this.data.set(key, data$);
    }
    return data$;
  }

  get<T>(key: string): T | undefined {
    return this.getLiveData(key).value;
  }
  watch<T>(key: string): Observable<T | undefined> {
    return this.getLiveData(key).asObservable();
  }
  set<T>(key: string, value: T): void {
    this.getLiveData(key).next(value);
  }
  keys(): string[] {
    return Array.from(this.data)
      .filter(([_, v$]) => v$.value !== undefined)
      .map(([k]) => k);
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
    get<T>(key: string): T | undefined {
      return memento.get(prefix + key);
    },
    watch(key: string) {
      return memento.watch(prefix + key);
    },
    set<T>(key: string, value: T): void {
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
