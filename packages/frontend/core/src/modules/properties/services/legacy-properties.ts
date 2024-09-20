import type { Tag } from '@affine/env/filter';
import type { DocsPropertiesMeta } from '@blocksuite/affine/store';
import type { WorkspaceService } from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import { Observable } from 'rxjs';

/**
 * @deprecated use WorkspacePropertiesAdapter instead (later)
 */
export class WorkspaceLegacyProperties extends Service {
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  get workspaceId() {
    return this.workspaceService.workspace.id;
  }

  get properties() {
    return this.workspaceService.workspace.docCollection.meta.properties;
  }
  get tagOptions() {
    return this.properties.tags?.options ?? [];
  }

  updateProperties = (properties: DocsPropertiesMeta) => {
    this.workspaceService.workspace.docCollection.meta.setProperties(
      properties
    );
  };

  subscribe(cb: () => void) {
    const disposable =
      this.workspaceService.workspace.docCollection.meta.docMetaUpdated.on(cb);
    return disposable.dispose;
  }

  properties$ = LiveData.from(
    new Observable<DocsPropertiesMeta>(sub => {
      return this.subscribe(() => sub.next(this.properties));
    }),
    this.properties
  );

  tagOptions$ = LiveData.from(
    new Observable<Tag[]>(sub => {
      return this.subscribe(() => sub.next(this.tagOptions));
    }),
    this.tagOptions
  );

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
}
