import fs from 'node:fs';

import type { Memento } from '@toeverything/infra';
import {
  backoffRetry,
  effect,
  exhaustMapWithTrailing,
  fromPromise,
} from '@toeverything/infra';
import { debounceTime, EMPTY, mergeMap, Observable, timeout } from 'rxjs';

import { logger } from '../logger';

export class PersistentJSONFileStorage implements Memento {
  data: Record<string, any> = {};
  subscriptions: Map<string, Set<(p: any) => void>> = new Map();
  subscriptionAll: Set<(p: Record<string, any>) => void> = new Set();

  constructor(readonly filepath: string) {
    try {
      this.data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    } catch (err) {
      // ignore ENOENT error
      if (
        !(
          err &&
          typeof err === 'object' &&
          'code' in err &&
          err.code === 'ENOENT'
        )
      ) {
        logger.error('failed to load file', err);
      }
    }
  }

  get<T>(key: string): T | undefined {
    return this.data[key];
  }
  all(): Record<string, any> {
    return this.data;
  }
  watch<T>(key: string): Observable<T | undefined> {
    const subs = this.subscriptions.get(key) || new Set();
    this.subscriptions.set(key, subs);
    return new Observable<T | undefined>(subscriber => {
      const sub = (p: any) => subscriber.next(p);
      subs.add(sub);
      return () => {
        subs.delete(sub);
      };
    });
  }
  watchAll(): Observable<Record<string, unknown | undefined>> {
    return new Observable<Record<string, unknown | undefined>>(subscriber => {
      const sub = (p: Record<string, unknown | undefined>) =>
        subscriber.next(p);
      this.subscriptionAll.add(sub);
      return () => {
        this.subscriptionAll.delete(sub);
      };
    });
  }
  set<T>(key: string, value: T): void {
    this.data[key] = value;
    const subs = this.subscriptions.get(key) || new Set();
    for (const sub of subs) {
      sub(value);
    }
    for (const sub of this.subscriptionAll) {
      sub({
        [key]: this.data[key],
      });
    }
    this.save();
  }

  del(key: string): void {
    delete this.data[key];
    const subs = this.subscriptions.get(key) || new Set();
    for (const sub of subs) {
      sub(undefined);
    }
    for (const sub of this.subscriptionAll) {
      sub({
        [key]: undefined,
      });
    }
    this.save();
  }
  clear(): void {
    const oldData = this.data;
    this.data = {};
    for (const [_, subs] of this.subscriptions) {
      for (const sub of subs) {
        sub(undefined);
      }
    }
    for (const sub of this.subscriptionAll) {
      sub(
        Object.fromEntries(
          Object.entries(oldData).map(([key]) => [key, undefined])
        )
      );
    }
    this.save();
  }

  keys(): string[] {
    return Object.keys(this.data);
  }

  save = effect(
    debounceTime(1000),
    exhaustMapWithTrailing(() => {
      return fromPromise(async () => {
        try {
          await fs.promises.writeFile(
            this.filepath,
            JSON.stringify(this.data, null, 2),
            'utf-8'
          );
        } catch (err) {
          logger.error(`failed to save file, ${this.filepath}`, err);
        }
      }).pipe(
        timeout(5000),
        backoffRetry({
          count: Infinity,
        }),
        mergeMap(() => EMPTY)
      );
    })
  );

  dispose() {
    this.save.unsubscribe();
  }
}
