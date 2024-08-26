import { Entity, LiveData } from '@toeverything/infra';
import { map, type Observable } from 'rxjs';

import type { EditorSettingProvider } from '../provider/editor-setting-provider';
import { EditorSettingSchema } from '../schema';

export class EditorSetting extends Entity {
  constructor(public readonly provider: EditorSettingProvider) {
    super();
  }

  settings$ = LiveData.from<EditorSettingSchema>(this.watchAll(), null as any);

  set<K extends keyof EditorSettingSchema>(
    key: K,
    value: EditorSettingSchema[K]
  ) {
    const schema = EditorSettingSchema.shape[key];

    this.provider.set(key, JSON.stringify(schema.parse(value)));
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
