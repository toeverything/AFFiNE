import { Store } from '@toeverything/infra';

import type { WorkspaceDBService } from '../../db';
import type { ExplorerIconType } from '../../db/schema/schema';

export type ExplorerType = 'doc' | 'collection' | 'folder' | 'tag';

export class ExplorerIconStore extends Store {
  constructor(private readonly dbService: WorkspaceDBService) {
    super();
  }

  watchIcon(type: ExplorerType, id: string) {
    return this.dbService.db.explorerIcon.get$(`${type}:${id}`);
  }

  getIcon(type: ExplorerType, id: string) {
    return this.dbService.db.explorerIcon.get(`${type}:${id}`);
  }

  setIcon(options: {
    where: ExplorerType;
    id: string;
    type?: ExplorerIconType;
    icon?: string;
  }) {
    const { where, id, type, icon } = options;
    // remove icon
    if (!type || !icon) {
      return this.dbService.db.explorerIcon.delete(`${where}:${id}`);
    }
    // upsert icon
    return this.dbService.db.explorerIcon.create({
      id: `${where}:${id}`,
      type,
      icon,
    });
  }
}
