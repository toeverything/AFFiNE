import type { GlobalState } from '@toeverything/infra';
import { Service } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { EditorSettingProvider } from '../provider/editor-setting-provider';

const storageKey = 'editor-setting';

/**
 * just for testing, vary poor performance
 */
export class GlobalStateEditorSettingProvider
  extends Service
  implements EditorSettingProvider
{
  constructor(public readonly globalState: GlobalState) {
    super();
  }
  set(key: string, value: string): void {
    const all = this.globalState.get<Record<string, string>>(storageKey) ?? {};
    const after = {
      ...all,
      [key]: value,
    };
    this.globalState.set(storageKey, after);
  }
  get(key: string): string | undefined {
    return this.globalState.get<Record<string, string>>(storageKey)?.[key];
  }
  watchAll(): Observable<Record<string, string>> {
    return this.globalState
      .watch<Record<string, string>>(storageKey)
      .pipe(map(all => all ?? {}));
  }
}
