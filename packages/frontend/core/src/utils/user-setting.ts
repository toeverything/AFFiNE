import type { Collection } from '@affine/env/filter';
import type { Workspace } from '@blocksuite/store';
import { nanoid } from 'nanoid';
import type { Map as YMap } from 'yjs';
import { Doc as YDoc } from 'yjs';
export class UserSetting {
  constructor(
    private workspace: Workspace,
    private userId: string
  ) {}

  get setting(): YDoc {
    const rootDoc = this.workspace.doc;
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

export const getUserSetting = (workspace: Workspace, userId: string) => {
  return new UserSetting(workspace, userId);
};
