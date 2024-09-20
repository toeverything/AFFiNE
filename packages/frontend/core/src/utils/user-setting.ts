import type { Collection } from '@affine/env/filter';
import type { DocCollection } from '@blocksuite/affine/store';
import { nanoid } from 'nanoid';
import type { Map as YMap } from 'yjs';
import { Doc as YDoc } from 'yjs';
export class UserSetting {
  constructor(
    private readonly docCollection: DocCollection,
    private readonly userId: string
  ) {}

  get setting(): YDoc {
    const rootDoc = this.docCollection.doc;
    const settingMap = rootDoc.getMap('settings') as YMap<YDoc>;
    if (!settingMap.has(this.userId)) {
      settingMap.set(
        this.userId,
        new YDoc({
          guid: nanoid(),
        })
      );
    }
    return settingMap.get(this.userId) as YDoc;
  }

  get loaded(): Promise<void> {
    if (!this.setting.isLoaded) {
      this.setting.load();
    }
    return this.setting.whenLoaded;
  }

  /**
   * @deprecated
   */
  get view() {
    return this.setting.getMap('view') as YMap<Collection>;
  }
}

export const getUserSetting = (
  docCollection: DocCollection,
  userId: string
) => {
  return new UserSetting(docCollection, userId);
};
