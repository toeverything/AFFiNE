import type { Tag, Tag as TagSchema } from '@affine/env/filter';
import type { DocsPropertiesMeta } from '@blocksuite/affine/store';
import type { WorkspaceService } from '@toeverything/infra';
import { LiveData, Store } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { Observable } from 'rxjs';

export class TagStore extends Store {
  get properties() {
    return this.workspaceService.workspace.docCollection.meta.properties;
  }
  get tagOptions() {
    return this.properties.tags?.options ?? [];
  }

  tagOptions$ = LiveData.from(
    new Observable<Tag[]>(sub => {
      return this.subscribe(() => sub.next(this.tagOptions));
    }),
    this.tagOptions
  );

  subscribe(cb: () => void) {
    const disposable =
      this.workspaceService.workspace.docCollection.meta.docMetaUpdated.on(cb);
    return disposable.dispose;
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
    this.updateTagOptions(this.tagOptions.map(o => (o.id === id ? option : o)));
  };

  removeTagOption = (id: string) => {
    this.workspaceService.workspace.docCollection.doc.transact(() => {
      this.updateTagOptions(this.tagOptions.filter(o => o.id !== id));
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
    this.workspaceService.workspace.docCollection.setDocMeta(pageId, {
      tags,
    });
  };

  deleteTag(id: string) {
    this.removeTagOption(id);
  }

  watchTagInfo(id: string) {
    return this.tagOptions$.map(
      tags => tags.find(tag => tag.id === id) as TagSchema | undefined
    );
  }

  updateTagInfo(id: string, tagInfo: Partial<TagSchema>) {
    const tag = this.tagOptions$.value.find(tag => tag.id === id) as
      | TagSchema
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
}
