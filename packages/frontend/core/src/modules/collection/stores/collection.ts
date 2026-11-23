import type { Collection as LegacyCollectionInfo } from '@affine/env/filter';
import {
  Store,
  yjsGetPath,
  yjsObserve,
  yjsObserveDeep,
} from '@toeverything/infra';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, map, type Observable, switchMap } from 'rxjs';
import { Array as YArray } from 'yjs';

import type { FilterParams } from '../../collection-rules';
import type { WorkspaceService } from '../../workspace';

export interface CollectionInfo {
  id: string;
  name: string;
  rules: {
    filters: FilterParams[];
  };
  allowList: string[];
}

export class CollectionStore extends Store {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  private get rootYDoc() {
    return this.workspaceService.workspace.rootYDoc;
  }

  private get workspaceSettingYMap() {
    return this.rootYDoc.getMap('setting');
  }

  watchCollectionDataReady() {
    return this.workspaceService.workspace.engine.doc
      .docState$(this.workspaceService.workspace.id)
      .pipe(
        map(docState => {
          return docState.ready;
        }),
        distinctUntilChanged()
      );
  }

  watchCollectionMetas() {
    return yjsGetPath(this.workspaceSettingYMap, 'collections').pipe(
      switchMap(yjsObserveDeep),
      map(yjs => {
        if (yjs instanceof YArray) {
          return yjs.map(v => {
            return {
              id: v.id as string,
              name: v.name as string,
              // for old code compatibility
              title: v.name as string,
            };
          });
        } else {
          return [];
        }
      })
    );
  }

  watchCollectionIds() {
    return yjsGetPath(this.workspaceSettingYMap, 'collections').pipe(
      switchMap(yjsObserve),
      map(yjs => {
        if (yjs instanceof YArray) {
          return yjs.map(v => {
            return v.id as string;
          });
        } else {
          return [];
        }
      })
    );
  }

  watchCollectionInfo(id: string): Observable<CollectionInfo | null> {
    return yjsGetPath(this.workspaceSettingYMap, 'collections').pipe(
      switchMap(yjsObserve),
      map(meta => {
        if (meta instanceof YArray) {
          // meta is YArray, `for-of` is faster then `for`
          for (const doc of meta) {
            if (doc && doc.id === id) {
              return doc;
            }
          }
          return null;
        } else {
          return null;
        }
      }),
      switchMap(yjsObserveDeep),
      map(yjs => {
        if (yjs) {
          return this.migrateCollectionInfo(yjs as LegacyCollectionInfo);
        } else {
          return null;
        }
      })
    );
  }

  createCollection(info: Partial<Omit<CollectionInfo, 'id'>>) {
    const id = nanoid();
    let yArray = this.rootYDoc.getMap('setting').get('collections') as
      | YArray<any>
      | undefined;

    if (!(yArray instanceof YArray)) {
      // if collections list is not a YArray, create a new one
      yArray = new YArray<any>();
      this.rootYDoc.getMap('setting').set('collections', yArray);
    }

    yArray.push([
      {
        id: id,
        name: info.name ?? '',
        rules: info.rules ?? { filters: [] },
        allowList: info.allowList ?? [],
      },
    ]);

    return id;
  }

  deleteCollection(id: string) {
    const yArray = this.rootYDoc.getMap('setting').get('collections') as
      | YArray<any>
      | undefined;

    if (!(yArray instanceof YArray)) {
      throw new Error('Collections is not a YArray');
    }

    for (let i = 0; i < yArray.length; i++) {
      const collection = yArray.get(i);
      if (collection.id === id) {
        yArray.delete(i);
        return;
      }
    }
  }

  updateCollectionInfo(id: string, info: Partial<Omit<CollectionInfo, 'id'>>) {
    const yArray = this.rootYDoc.getMap('setting').get('collections') as
      | YArray<any>
      | undefined;

    if (!(yArray instanceof YArray)) {
      throw new Error('Collections is not a YArray');
    }

    let collectionIndex = 0;
    for (const collection of yArray) {
      if (collection.id === id) {
        this.rootYDoc.transact(() => {
          yArray.delete(collectionIndex, 1);
          const migratedCollectionInfo = this.migrateCollectionInfo(collection);
          yArray.insert(collectionIndex, [
            {
              id: collection.id,
              name: info.name ?? migratedCollectionInfo.name,
              rules: info.rules ?? migratedCollectionInfo.rules,
              allowList: info.allowList ?? migratedCollectionInfo.allowList,
            },
          ]);
        });

        return;
      }
      collectionIndex++;
    }
  }

  migrateCollectionInfo(
    legacyCollectionInfo: LegacyCollectionInfo
  ): CollectionInfo {
    if ('rules' in legacyCollectionInfo && legacyCollectionInfo.rules) {
      return legacyCollectionInfo as CollectionInfo;
    }
    return {
      id: legacyCollectionInfo.id,
      name: legacyCollectionInfo.name,
      rules: {
        filters: legacyCollectionInfo.filterList
          ? this.migrateFilterList(legacyCollectionInfo.filterList)
          : [],
      },
      allowList: legacyCollectionInfo.allowList,
    };
  }

  migrateFilterList(
    filterList: LegacyCollectionInfo['filterList']
  ): FilterParams[] {
    try {
      return filterList.map(filter => {
        const leftValue = filter.left.name;
        const method = filter.funcName;
        const args = filter.args.filter(arg => !!arg).map(arg => arg.value);
        const arg0 = args[0];
        if (leftValue === 'Created' || leftValue === 'Updated') {
          const key = leftValue === 'Created' ? 'createdAt' : 'updatedAt';
          if (method === 'after' && typeof arg0 === 'number') {
            return {
              type: 'system',
              key,
              method: 'after',
              value: dayjs(arg0).format('YYYY-MM-DD'),
            };
          } else if (method === 'before' && typeof arg0 === 'number') {
            return {
              type: 'system',
              key,
              method: 'before',
              value: dayjs(arg0).format('YYYY-MM-DD'),
            };
          } else if (method === 'last' && typeof arg0 === 'number') {
            return {
              type: 'system',
              key,
              method: 'last',
              value: dayjs().subtract(arg0, 'day').format('YYYY-MM-DD'),
            };
          }
        } else if (leftValue === 'Is Favourited') {
          if (method === 'is') {
            const value = arg0 ? 'true' : 'false';
            return {
              type: 'system',
              key: 'favorite',
              method: 'is',
              value,
            };
          }
        } else if (leftValue === 'Tags') {
          if (method === 'is not empty') {
            return {
              type: 'system',
              key: 'tags',
              method: 'is-not-empty',
            };
          } else if (method === 'is empty') {
            return {
              type: 'system',
              key: 'tags',
              method: 'is-empty',
            };
          } else if (method === 'contains all' && Array.isArray(arg0)) {
            return {
              type: 'system',
              key: 'tags',
              method: 'include-all',
              value: arg0.join(','),
            };
          } else if (method === 'contains one of' && Array.isArray(arg0)) {
            return {
              type: 'system',
              key: 'tags',
              method: 'include-any-of',
              value: arg0.join(','),
            };
          } else if (
            method === 'does not contains all' &&
            Array.isArray(arg0)
          ) {
            return {
              type: 'system',
              key: 'tags',
              method: 'not-include-all',
              value: arg0.join(','),
            };
          } else if (
            method === 'does not contains one of' &&
            Array.isArray(arg0)
          ) {
            return {
              type: 'system',
              key: 'tags',
              method: 'not-include-any-of',
              value: arg0.join(','),
            };
          }
        } else if (leftValue === 'Is Public' && method === 'is') {
          return {
            type: 'system',
            key: 'shared',
            method: 'is',
            value: arg0 ? 'true' : 'false',
          };
        }

        return {
          type: 'unknown',
          key: 'unknown',
          method: 'unknown',
        };
      });
    } catch (err) {
      console.error('Failed to migrate filter list', err);
      return [];
    }
  }
}
