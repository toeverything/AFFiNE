import { type IconData, IconType } from '@affine/component';
import { LiveData, Service } from '@toeverything/infra';

import type { WorkspaceService } from '../../workspace';
import type { ExplorerIconStore, ExplorerType } from '../store/explorer-icon';

export class ExplorerIconService extends Service {
  constructor(
    private readonly store: ExplorerIconStore,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  getIcon(type: ExplorerType, id: string) {
    return this.store.getIcon(type, id);
  }

  /**
   * Set or remove an icon. A raw `Blob` (a custom image picked in the UI) is
   * uploaded to the workspace blob engine first and replaced with its
   * content-addressed blob id before being persisted.
   */
  async setIcon(options: {
    where: ExplorerType;
    id: string;
    icon?: IconData | Blob;
  }) {
    const { where, id, icon } = options;
    if (icon instanceof Blob) {
      const blobId =
        await this.workspaceService.workspace.docCollection.blobSync.set(icon);
      return this.store.setIcon({
        where,
        id,
        icon: { type: IconType.Blob, blobId },
      });
    }
    return this.store.setIcon({ where, id, icon });
  }

  icon$(type: ExplorerType, id: string) {
    return LiveData.from(this.store.watchIcon(type, id), null);
  }
}
