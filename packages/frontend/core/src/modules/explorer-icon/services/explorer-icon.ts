import { type IconData, IconType } from '@affine/component';
import { LiveData, Service } from '@toeverything/infra';

import type { WorkspaceService } from '../../workspace';
import type { ExplorerIconStore, ExplorerType } from '../store/explorer-icon';

export class ExplorerIconService extends Service {
  // A blob upload is asynchronous. A user can select a second icon before
  // the first upload resolves, and the first result would then overwrite
  // the later selection. Each target counts its selections, and an upload
  // result applies only when its selection is still the latest one.
  private readonly latestSelection = new Map<string, number>();

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
    const target = `${where}:${id}`;
    const generation = (this.latestSelection.get(target) ?? 0) + 1;
    this.latestSelection.set(target, generation);
    if (icon instanceof Blob) {
      const blobId =
        await this.workspaceService.workspace.docCollection.blobSync.set(icon);
      if (this.latestSelection.get(target) !== generation) {
        return;
      }
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
