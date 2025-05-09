import type { DeepPartial } from '@blocksuite/affine/global/utils';
import {
  createSignalFromObservable,
  type Signal,
} from '@blocksuite/affine/shared/utils';
import { Entity, LiveData } from '@toeverything/infra';
import { isObject, merge } from 'lodash-es';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

import type { EditorSettingProvider } from '../provider/editor-setting-provider';
import { EditorSettingSchema } from '../schema';

type SettingItem<T> = {
  readonly value: T;
  set: (value: T) => void;

  $: LiveData<T>;
};

export class EditorSetting extends Entity {
  constructor(public readonly provider: EditorSettingProvider) {
    super();

    const { signal, cleanup } = createSignalFromObservable<
      Partial<EditorSettingSchema>
    >(this.settings$, {});
    this.settingSignal = signal;
    this.disposables.push(cleanup);

    Object.entries(EditorSettingSchema.shape).forEach(([flagKey, flag]) => {
      const livedata$ = this.settings$.selector(
        s => s[flagKey as keyof EditorSettingSchema]
      );
      const item = {
        ...flag,
        get value() {
          return livedata$.value;
        },
        set: (value: any) => {
          this.set(flagKey as keyof EditorSettingSchema, value);
        },
        $: livedata$,
      } as SettingItem<unknown>;
      Object.defineProperty(this, flagKey, {
        get: () => {
          return item;
        },
      });
    });
  }

  settings$ = LiveData.from<EditorSettingSchema>(this.watchAll(), null as any);

  settingSignal: Signal<Partial<EditorSettingSchema>>;

  get<K extends keyof EditorSettingSchema>(key: K) {
    return this.settings$.value[key];
  }

  set<K extends keyof EditorSettingSchema>(
    key: K,
    value: DeepPartial<EditorSettingSchema[K]>
  ) {
    const schema = EditorSettingSchema.shape[key];
    const curValue = this.get(key);
    const nextValue = isObject(curValue) ? merge(curValue, value) : value;
    this.provider.set(key, JSON.stringify(schema.parse(nextValue)));
  }

  private watchAll(): Observable<EditorSettingSchema> {
    return this.provider.watchAll().pipe(
      map(
        all =>
          Object.fromEntries(
            Object.entries(EditorSettingSchema.shape).map(([key, schema]) => {
              const value = all[key];
              const parsed = schema.safeParse(
                value ? JSON.parse(value) : undefined
              );
              return [
                key,
                // if parsing fails, return the default value
                parsed.success ? parsed.data : schema.parse(undefined),
              ];
            })
          ) as EditorSettingSchema
      )
    );
  }
}

export type EditorSettingExt = EditorSetting & {
  [K in keyof EditorSettingSchema]: SettingItem<EditorSettingSchema[K]>;
};
