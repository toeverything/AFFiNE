import { Observable } from 'rxjs';

import type { DesktopApiService } from '../../desktop-api';
import type { GlobalCache, GlobalState } from '../providers/global';

export class ElectronGlobalState implements GlobalState {
  constructor(private readonly electronApi: DesktopApiService) {}

  keys(): string[] {
    return this.electronApi.sharedStorage.globalState.keys();
  }
  get<T>(key: string): T | undefined {
    return this.electronApi.sharedStorage.globalState.get(key);
  }
  watch<T>(key: string) {
    return new Observable<T | undefined>(subscriber => {
      const unsubscribe = this.electronApi.sharedStorage.globalState.watch<T>(
        key,
        i => {
          subscriber.next(i);
        }
      );
      return () => unsubscribe();
    });
  }
  set<T>(key: string, value: T): void {
    // oxlint-disable-next-line typescript/no-floating-promises -- preload handles IPC errors
    this.electronApi.sharedStorage.globalState.set(key, value);
  }
  del(key: string): void {
    // oxlint-disable-next-line typescript/no-floating-promises -- preload handles IPC errors
    this.electronApi.sharedStorage.globalState.del(key);
  }
  clear(): void {
    // oxlint-disable-next-line typescript/no-floating-promises -- preload handles IPC errors
    this.electronApi.sharedStorage.globalState.clear();
  }
}

export class ElectronGlobalCache implements GlobalCache {
  constructor(private readonly electronApi: DesktopApiService) {}

  keys(): string[] {
    return this.electronApi.sharedStorage.globalCache.keys();
  }
  get<T>(key: string): T | undefined {
    return this.electronApi.sharedStorage.globalCache.get(key);
  }
  watch<T>(key: string) {
    return new Observable<T | undefined>(subscriber => {
      const unsubscribe = this.electronApi.sharedStorage.globalCache.watch<T>(
        key,
        i => {
          subscriber.next(i);
        }
      );
      return () => unsubscribe();
    });
  }
  set<T>(key: string, value: T): void {
    // oxlint-disable-next-line typescript/no-floating-promises -- preload handles IPC errors
    this.electronApi.sharedStorage.globalCache.set(key, value);
  }
  del(key: string): void {
    // oxlint-disable-next-line typescript/no-floating-promises -- preload handles IPC errors
    this.electronApi.sharedStorage.globalCache.del(key);
  }
  clear(): void {
    // oxlint-disable-next-line typescript/no-floating-promises -- preload handles IPC errors
    this.electronApi.sharedStorage.globalCache.clear();
  }
}
