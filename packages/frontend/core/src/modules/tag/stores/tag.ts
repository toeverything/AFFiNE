import type { DocsPropertiesMeta } from '@blocksuite/affine/store';
import {
  LiveData,
  Store,
  yjsGetPath,
  yjsObserveDeep,
  yjsObservePath,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { map, switchMap } from 'rxjs';
import { Array as YArray } from 'yjs';

import type { WorkspaceService } from '../../workspace';

export type Tag = {
  value: string;
  id: string;
  color: string;
  createDate?: number | Date | undefined;
  updateDate?: number | Date | undefined;
  parentId?: string | undefined;
};

export class TagStore extends Store {
  get properties() {
    return this.workspaceService.workspace.docCollection.meta.properties;
  }

  tagOptions$ = LiveData.from(
    yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'properties.tags.options'
    ).pipe(
      switchMap(yjsObserveDeep),
      map(tagOptions => {
        if (tagOptions instanceof YArray) {
          return tagOptions.toJSON();
        } else {
          return [];
        }
      })
    ),
    []
  );

  subscribe(cb: () => void) {
    const disposable =
      this.workspaceService.workspace.docCollection.slots.docListUpdated.subscribe(
        cb
      );
    return disposable.unsubscribe.bind(disposable);
  }

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  watchTagIds() {
    return this.tagOptions$.map(tags => tags.map(tag => tag.id)).asObservable();
  }

  createNewTag(value: string, color: string) {
    const newId = nanoid();
    this.updateTagOptions([
      ...this.tagOptions$.value,
      {
        id: newId,
        value,
        color,
        createDate: Date.now(),
        updateDate: Date.now(),
      },
    ]);
    return newId;
  }

  updateProperties = (properties: DocsPropertiesMeta) => {
    this.workspaceService.workspace.docCollection.meta.setProperties(
      properties
    );
  };

  updateTagOptions = (options: Tag[]) => {
    this.updateProperties({
      ...this.properties,
      tags: {
        options,
      },
    });
  };

  updateTagOption = (id: string, option: Tag) => {
    this.updateTagOptions(
      this.tagOptions$.value.map(o => (o.id === id ? option : o))
    );
  };

  removeTagOption = (id: string) => {
    this.workspaceService.workspace.docCollection.doc.transact(() => {
      this.updateTagOptions(this.tagOptions$.value.filter(o => o.id !== id));
      // need to remove tag from all pages
      this.workspaceService.workspace.docCollection.docs.forEach(doc => {
        const tags = doc.meta?.tags ?? [];
        if (tags.includes(id)) {
          this.updatePageTags(
            doc.id,
            tags.filter(t => t !== id)
          );
        }
      });
    });
  };

  updatePageTags = (pageId: string, tags: string[]) => {
    this.workspaceService.workspace.docCollection.meta.setDocMeta(pageId, {
      tags,
    });
  };

  deleteTag(id: string) {
    this.removeTagOption(id);
  }

  watchTagInfo(id: string) {
    return this.tagOptions$.map(
      tags => tags.find(tag => tag.id === id) as Tag | undefined
    );
  }

  updateTagInfo(id: string, tagInfo: Partial<Tag>) {
    const tag = this.tagOptions$.value.find(tag => tag.id === id) as
      | Tag
      | undefined;
    if (!tag) {
      return;
    }
    this.updateTagOption(id, {
      id: id,
      value: tag.value,
      color: tag.color,
      createDate: tag.createDate,
      updateDate: Date.now(),
      ...tagInfo,
    });
  }

  watchTagPageIds(id: string) {
    return yjsGetPath(
      this.workspaceService.workspace.rootYDoc.getMap('meta'),
      'pages'
    ).pipe(
      switchMap(pages => {
        return yjsObservePath(pages, '*.tags');
      }),
      map(meta => {
        if (meta instanceof YArray) {
          return meta
            .map(v => {
              const tags = v.get('tags') as YArray<string> | undefined;
              if (tags instanceof YArray) {
                for (const tagId of tags.toArray()) {
                  if (tagId === id) {
                    return v.get('id') as string;
                  }
                }
              }
              return null;
            })
            .filter(Boolean) as string[];
        } else {
          return [];
        }
      })
    );
  }
}
