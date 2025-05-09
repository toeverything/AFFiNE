import {
  LiveData,
  Store,
  yjsGetPath,
  yjsObserveDeep,
} from '@toeverything/infra';
import { isNil, omitBy } from 'lodash-es';
import { combineLatest, map, switchMap } from 'rxjs';
import { AbstractType as YAbstractType } from 'yjs';

import type { WorkspaceDBService } from '../../db';
import type { DocProperties } from '../../db/schema/schema';
import type { WorkspaceService } from '../../workspace';

interface LegacyDocProperties {
  custom?: Record<string, { value: unknown } | undefined>;
  system?: Record<string, { value: unknown } | undefined>;
}

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

  /**
   * find doc ids by property key and value
   *
   * this apis will not include legacy properties
   */
  watchPropertyAllValues(propertyKey: string) {
    return LiveData.from<Map<string, string | undefined>>(
      this.dbService.db.docProperties
        .select$(propertyKey)
        .pipe(map(o => new Map(o.map(i => [i.id, i[propertyKey]])))),
      new Map()
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

  private getLegacyDocProperties(id: string) {
    return this.workspaceService.workspace.rootYDoc
      .getMap<any>('affine:workspace-properties')
      .get('pageProperties')
      ?.get(id)
      ?.toJSON() as LegacyDocProperties | undefined;
  }

  private watchLegacyDocProperties(id: string) {
    return yjsGetPath(
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
}
