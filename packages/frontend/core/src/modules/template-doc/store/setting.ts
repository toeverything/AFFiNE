import { LiveData, Store } from '@toeverything/infra';

import type { WorkspaceDBService } from '../../db';
import type { TemplateDocSettings } from '../type';

export class TemplateDocSettingStore extends Store {
  private readonly key = 'templateDoc';

  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  watchIsLoading() {
    return (
      this.dbService.userdataDB$
        .map(db => LiveData.from(db.settings.isLoading$, false))
        // oxlint-disable-next-line unicorn/prefer-array-flat-map -- LiveData doesn't have flatMap
        .flat()
    );
  }

  watchSetting() {
    return (
      this.dbService.userdataDB$
        .map(db => LiveData.from(db.settings.find$({ key: this.key }), []))
        // oxlint-disable-next-line unicorn/prefer-array-flat-map -- LiveData doesn't have flatMap
        .flat()
        .map(raw => raw?.[0]?.value as TemplateDocSettings)
    );
  }

  watchSettingKey<T extends keyof TemplateDocSettings>(key: T) {
    return (
      this.dbService.userdataDB$
        .map(db => LiveData.from(db.settings.find$({ key: this.key }), []))
        // oxlint-disable-next-line unicorn/prefer-array-flat-map -- LiveData doesn't have flatMap
        .flat()
        .map(raw => {
          const value = raw?.[0]?.value as TemplateDocSettings;
          if (!value) return undefined;
          return value[key];
        })
    );
  }

  updateSetting<T extends keyof TemplateDocSettings>(
    key: T,
    value: TemplateDocSettings[T]
  ) {
    const db = this.dbService.userdataDB$.value;
    const prev = db.settings.find({ key: this.key })[0]?.value ?? {};
    db.settings.create({
      key: this.key,
      value: { ...prev, [key]: value },
    });
  }
}
