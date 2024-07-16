import { sharedStorage } from '@affine/electron-api';
import type { GlobalCache, GlobalState } from '@toeverything/infra';
import { Observable } from 'rxjs';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const ensureSharedStorage = sharedStorage!;

export class ElectronGlobalState implements GlobalState {
  keys(): string[] {
    return ensureSharedStorage.globalState.keys();
  }
  get<T>(key: string): T | undefined {
    return ensureSharedStorage.globalState.get(key);
  }
  watch<T>(key: string) {
    return new Observable<T | undefined>(subscriber => {
      const unsubscribe = ensureSharedStorage.globalState.watch<T>(key, i => {
        subscriber.next(i);
      });
      return () => unsubscribe();
    });
  }
  set<T>(key: string, value: T): void {
    ensureSharedStorage.globalState.set(key, value);
  }
  del(key: string): void {
    ensureSharedStorage.globalState.del(key);
  }
  clear(): void {
    ensureSharedStorage.globalState.clear();
  }
}

export class ElectronGlobalCache implements GlobalCache {
  keys(): string[] {
    return ensureSharedStorage.globalCache.keys();
  }
  get<T>(key: string): T | undefined {
    return ensureSharedStorage.globalCache.get(key);
  }
  watch<T>(key: string) {
    return new Observable<T | undefined>(subscriber => {
      const unsubscribe = ensureSharedStorage.globalCache.watch<T>(key, i => {
        subscriber.next(i);
      });
      return () => unsubscribe();
    });
  }
  set<T>(key: string, value: T): void {
    ensureSharedStorage.globalCache.set(key, value);
  }
  del(key: string): void {
    ensureSharedStorage.globalCache.del(key);
  }
  clear(): void {
    ensureSharedStorage.globalCache.clear();
  }
}
