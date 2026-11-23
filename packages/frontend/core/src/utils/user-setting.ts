import type { Workspace } from '@blocksuite/affine/store';
import { nanoid } from 'nanoid';
import type { Map as YMap } from 'yjs';
import { Doc as YDoc } from 'yjs';
export class UserSetting {
  constructor(
    private readonly docCollection: Workspace,
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
}

export const getUserSetting = (docCollection: Workspace, userId: string) => {
  return new UserSetting(docCollection, userId);
};
