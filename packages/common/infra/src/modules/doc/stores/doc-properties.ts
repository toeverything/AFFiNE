import { differenceBy, isNil, omitBy } from 'lodash-es';
import { combineLatest, map, switchMap } from 'rxjs';
import { AbstractType as YAbstractType } from 'yjs';

import { Store } from '../../../framework';
import {
  yjsObserveByPath,
  yjsObserveDeep,
} from '../../../utils/yjs-observable';
import type { WorkspaceDBService } from '../../db';
import type {
  DocCustomPropertyInfo,
  DocProperties,
} from '../../db/schema/schema';
import type { WorkspaceService } from '../../workspace';
import { BUILT_IN_CUSTOM_PROPERTY_TYPE } from '../constants';

interface LegacyDocProperties {
  custom?: Record<string, { value: unknown } | undefined>;
  system?: Record<string, { value: unknown } | undefined>;
}

type LegacyDocPropertyInfo = {
  id?: string;
  name?: string;
  type?: string;
  icon?: string;
};

type LegacyDocPropertyInfoList = Record<
  string,
  LegacyDocPropertyInfo | undefined
>;

export class DocPropertiesStore extends Store {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly dbService: WorkspaceDBService
  ) {
    super();
  }

  updateDocProperties(id: string, config: Partial<DocProperties>) {
    return this.dbService.db.docProperties.create({
      id,
      ...config,
    });
  }

  getDocPropertyInfoList() {
    const db = this.dbService.db.docCustomPropertyInfo.find();
    const legacy = this.upgradeLegacyDocPropertyInfoList(
      this.getLegacyDocPropertyInfoList()
    );
    const builtIn = BUILT_IN_CUSTOM_PROPERTY_TYPE;
    const withLegacy = [...db, ...differenceBy(legacy, db, i => i.id)];
    const all = [
      ...withLegacy,
      ...differenceBy(builtIn, withLegacy, i => i.id),
    ];
    return all.filter(i => !i.isDeleted);
  }

  createDocPropertyInfo(
    config: Omit<DocCustomPropertyInfo, 'id'> & { id?: string }
  ) {
    return this.dbService.db.docCustomPropertyInfo.create(config).id;
  }

  removeDocPropertyInfo(id: string) {
    this.updateDocPropertyInfo(id, {
      additionalData: {}, // also remove additional data to reduce size
      isDeleted: true,
    });
  }

  updateDocPropertyInfo(id: string, config: Partial<DocCustomPropertyInfo>) {
    const needMigration = !this.dbService.db.docCustomPropertyInfo.get(id);
    const isBuiltIn =
      needMigration && BUILT_IN_CUSTOM_PROPERTY_TYPE.some(i => i.id === id);
    if (isBuiltIn) {
      this.createPropertyFromBuiltIn(id, config);
    } else if (needMigration) {
      // if this property is not in db, we need to migration it from legacy to db, only type and name is needed
      this.migrateLegacyDocPropertyInfo(id, config);
    } else {
      this.dbService.db.docCustomPropertyInfo.update(id, config);
    }
  }

  migrateLegacyDocPropertyInfo(
    id: string,
    override: Partial<DocCustomPropertyInfo>
  ) {
    const legacy = this.getLegacyDocPropertyInfo(id);
    this.dbService.db.docCustomPropertyInfo.create({
      id,
      type:
        legacy?.type ??
        'unknown' /* should never reach here, just for safety, we need handle unknown property type */,
      name: legacy?.name,
      ...override,
    });
  }

  createPropertyFromBuiltIn(
    id: string,
    override: Partial<DocCustomPropertyInfo>
  ) {
    const builtIn = BUILT_IN_CUSTOM_PROPERTY_TYPE.find(i => i.id === id);
    if (!builtIn) {
      return;
    }
    this.createDocPropertyInfo({ ...builtIn, ...override });
  }

  watchDocPropertyInfoList() {
    return combineLatest([
      this.watchLegacyDocPropertyInfoList().pipe(
        map(this.upgradeLegacyDocPropertyInfoList)
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

  getDocProperties(id: string) {
    return {
      ...this.upgradeLegacyDocProperties(this.getLegacyDocProperties(id)),
      ...omitBy(this.dbService.db.docProperties.get(id), isNil),
      // db always override legacy, but nil value should not override
    };
  }

  watchDocProperties(id: string) {
    return combineLatest([
      this.watchLegacyDocProperties(id).pipe(
        map(this.upgradeLegacyDocProperties)
      ),
      this.dbService.db.docProperties.get$(id),
    ]).pipe(
      map(
        ([legacy, db]) =>
          ({
            ...legacy,
            ...omitBy(db, isNil), // db always override legacy, but nil value should not override
          }) as DocProperties
      )
    );
  }

  private upgradeLegacyDocProperties(properties?: LegacyDocProperties) {
    if (!properties) {
      return {};
    }
    const newProperties: Record<string, string> = {};
    for (const [key, info] of Object.entries(properties.system ?? {})) {
      if (info?.value !== undefined && info.value !== null) {
        newProperties[key] = info.value.toString();
      }
    }
    for (const [key, info] of Object.entries(properties.custom ?? {})) {
      if (info?.value !== undefined && info.value !== null) {
        newProperties['custom:' + key] = info.value.toString();
      }
    }
    return newProperties;
  }

  private upgradeLegacyDocPropertyInfoList(
    infoList?: LegacyDocPropertyInfoList
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
          type: info.type,
          icon: info.icon,
        });
      }
    }

    return newInfoList;
  }

  private getLegacyDocProperties(id: string) {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('pageProperties')
      ?.get(id)
      ?.toJSON() as LegacyDocProperties | undefined;
  }

  private watchLegacyDocProperties(id: string) {
    return yjsObserveByPath(
      this.workspaceService.workspace.rootYDoc.getMap<any>(
        'affine:workspace-properties'
      ),
      `pageProperties.${id}`
    ).pipe(
      switchMap(yjsObserveDeep),
      map(
        p =>
          (p instanceof YAbstractType ? p.toJSON() : p) as
            | LegacyDocProperties
            | undefined
      )
    );
  }

  private getLegacyDocPropertyInfoList() {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('schema')
      ?.get('pageProperties')
      ?.get('custom')
      ?.toJSON() as LegacyDocPropertyInfoList | undefined;
  }

  private watchLegacyDocPropertyInfoList() {
    return yjsObserveByPath(
      this.workspaceService.workspace.rootYDoc.getMap<any>(
        'affine:workspace-properties'
      ),
      'schema.pageProperties.custom'
    ).pipe(
      switchMap(yjsObserveDeep),
      map(
        p =>
          (p instanceof YAbstractType ? p.toJSON() : p) as
            | LegacyDocPropertyInfoList
            | undefined
      )
    );
  }

  private getLegacyDocPropertyInfo(id: string) {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('schema')
      ?.get('pageProperties')
      ?.get('custom')
      ?.get(id)
      ?.toJSON() as LegacyDocPropertyInfo | undefined;
  }
}
