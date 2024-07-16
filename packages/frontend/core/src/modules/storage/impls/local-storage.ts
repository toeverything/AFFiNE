import type { GlobalCache, GlobalState, Memento } from '@toeverything/infra';
import { Observable } from 'rxjs';

export class LocalStorageMemento implements Memento {
  constructor(private readonly prefix: string) {}

  keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(this.prefix)) {
        keys.push(key.slice(this.prefix.length));
      }
    }
    return keys;
  }

  get<T>(key: string): T | undefined {
    const json = localStorage.getItem(this.prefix + key);
    return json ? JSON.parse(json) : undefined;
  }
  watch<T>(key: string): Observable<T | undefined> {
    return new Observable<T | undefined>(subscriber => {
      const json = localStorage.getItem(this.prefix + key);
      const first = json ? JSON.parse(json) : undefined;
      subscriber.next(first);

      const channel = new BroadcastChannel(this.prefix + key);
      channel.addEventListener('message', event => {
        subscriber.next(event.data);
      });
      return () => {
        channel.close();
      };
    });
  }
  set<T>(key: string, value: T): void {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
    const channel = new BroadcastChannel(this.prefix + key);
    channel.postMessage(value);
    channel.close();
  }

  del(key: string): void {
    localStorage.removeItem(this.prefix + key);
  }

  clear(): void {
    for (const key of this.keys()) {
      this.del(key);
    }
  }
}

export class LocalStorageGlobalCache
  extends LocalStorageMemento
  implements GlobalCache
{
  constructor() {
    super('global-cache:');
  }
}

export class LocalStorageGlobalState
  extends LocalStorageMemento
  implements GlobalState
{
  constructor() {
    super('global-state:');
  }
}
