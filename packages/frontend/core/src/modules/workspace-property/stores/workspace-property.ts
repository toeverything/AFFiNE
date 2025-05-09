import { Store, yjsGetPath, yjsObserveDeep } from '@toeverything/infra';
import { differenceBy } from 'lodash-es';
import { combineLatest, map, switchMap } from 'rxjs';
import { AbstractType as YAbstractType } from 'yjs';

import type { WorkspaceDBService } from '../../db';
import type { DocCustomPropertyInfo } from '../../db/schema/schema';
import type { WorkspaceService } from '../../workspace';
import { BUILT_IN_CUSTOM_PROPERTY_TYPE } from '../constants';
import type { WorkspacePropertyType } from '../types';

type LegacyWorkspacePropertyInfo = {
  id?: string;
  name?: string;
  type?: string;
  icon?: string;
};

type LegacyWorkspacePropertyInfoList = Record<
  string,
  LegacyWorkspacePropertyInfo | undefined
>;

export class WorkspacePropertyStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly dbService: WorkspaceDBService
  ) {
    super();
  }

  getWorkspaceProperties() {
    const db = this.dbService.db.docCustomPropertyInfo.find();
    const legacy = this.upgradeLegacyWorkspacePropertyInfoList(
      this.getLegacyWorkspacePropertyInfoList()
    );
    const builtIn = BUILT_IN_CUSTOM_PROPERTY_TYPE;
    const withLegacy = [...db, ...differenceBy(legacy, db, i => i.id)];
    const all = [
      ...withLegacy,
      ...differenceBy(builtIn, withLegacy, i => i.id),
    ];
    return all.filter(i => !i.isDeleted);
  }

  createWorkspaceProperty(
    config: Omit<DocCustomPropertyInfo, 'id'> & { id?: string }
  ) {
    return this.dbService.db.docCustomPropertyInfo.create(config);
  }

  removeWorkspaceProperty(id: string) {
    this.updateWorkspaceProperty(id, {
      additionalData: {}, // also remove additional data to reduce size
      isDeleted: true,
    });
  }

  updateWorkspaceProperty(id: string, config: Partial<DocCustomPropertyInfo>) {
    const needMigration = !this.dbService.db.docCustomPropertyInfo.get(id);
    const isBuiltIn =
      needMigration && BUILT_IN_CUSTOM_PROPERTY_TYPE.some(i => i.id === id);
    if (isBuiltIn) {
      this.createWorkspacePropertyFromBuiltIn(id, config);
    } else if (needMigration) {
      // if this property is not in db, we need to migration it from legacy to db, only type and name is needed
      this.migrateLegacyWorkspaceProperty(id, config);
    } else {
      this.dbService.db.docCustomPropertyInfo.update(id, config);
    }
  }

  migrateLegacyWorkspaceProperty(
    id: string,
    override: Partial<DocCustomPropertyInfo>
  ) {
    const legacy = this.getLegacyWorkspacePropertyInfo(id);
    this.dbService.db.docCustomPropertyInfo.create({
      id,
      type: (legacy?.type ??
        'unknown') /* should never reach here, just for safety, we need handle unknown property type */ as WorkspacePropertyType,
      name: legacy?.name,
      ...override,
    });
  }

  createWorkspacePropertyFromBuiltIn(
    id: string,
    override: Partial<DocCustomPropertyInfo>
  ) {
    const builtIn = BUILT_IN_CUSTOM_PROPERTY_TYPE.find(i => i.id === id);
    if (!builtIn) {
      return;
    }
    this.createWorkspaceProperty({ ...builtIn, ...override });
  }

  watchWorkspaceProperties() {
    return combineLatest([
      this.watchLegacyWorkspacePropertyInfoList().pipe(
        map(this.upgradeLegacyWorkspacePropertyInfoList)
      ),
      this.dbService.db.docCustomPropertyInfo.find$(),
    ]).pipe(
      map(([legacy, db]) => {
        const builtIn = BUILT_IN_CUSTOM_PROPERTY_TYPE;
        const withLegacy = [...db, ...differenceBy(legacy, db, i => i.id)];
        const all = [
          ...withLegacy,
          ...differenceBy(builtIn, withLegacy, i => i.id),
        ];
        return all.filter(i => !i.isDeleted);
      })
    );
  }

  private upgradeLegacyWorkspacePropertyInfoList(
    infoList?: LegacyWorkspacePropertyInfoList
  ) {
    if (!infoList) {
      return [];
    }

    const newInfoList: DocCustomPropertyInfo[] = [];

    for (const [id, info] of Object.entries(infoList ?? {})) {
      if (info?.type) {
        newInfoList.push({
          id,
          name: info.name,
          type: info.type as WorkspacePropertyType,
          icon: info.icon,
        });
      }
    }

    return newInfoList;
  }

  private getLegacyWorkspacePropertyInfoList() {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('schema')
      ?.get('pageProperties')
      ?.get('custom')
      ?.toJSON() as LegacyWorkspacePropertyInfoList | undefined;
  }

  private watchLegacyWorkspacePropertyInfoList() {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap<any>(
        'affine:workspace-properties'
      ),
      'schema.pageProperties.custom'
    ).pipe(
      switchMap(yjsObserveDeep),
      map(
        p =>
          (p instanceof YAbstractType ? p.toJSON() : p) as
            | LegacyWorkspacePropertyInfoList
            | undefined
      )
    );
  }

  private getLegacyWorkspacePropertyInfo(id: string) {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('schema')
      ?.get('pageProperties')
      ?.get('custom')
      ?.get(id)
      ?.toJSON() as LegacyWorkspacePropertyInfo | undefined;
  }
}
