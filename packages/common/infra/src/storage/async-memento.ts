import { type Observable } from 'rxjs';

export interface AsyncMemento {
  watch<T>(key: string): Observable<T | undefined>;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T | undefined): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
}
