import type { Tag } from '@affine/env/filter';
import type { DocsPropertiesMeta } from '@blocksuite/store';
import { LiveData } from '@toeverything/infra/livedata';
import type { Workspace } from '@toeverything/infra/workspace';
import { Observable } from 'rxjs';

/**
 * @deprecated use WorkspacePropertiesAdapter instead (later)
 */
export class WorkspaceLegacyProperties {
  constructor(private readonly workspace: Workspace) {}

  get workspaceId() {
    return this.workspace.id;
  }

  get properties() {
    return this.workspace.docCollection.meta.properties;
  }
  get tagOptions() {
    return this.properties.tags?.options ?? [];
  }

  updateProperties = (properties: DocsPropertiesMeta) => {
    this.workspace.docCollection.meta.setProperties(properties);
  };

  subscribe(cb: () => void) {
    const disposable = this.workspace.docCollection.meta.docMetaUpdated.on(cb);
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
    this.workspace.docCollection.doc.transact(() => {
      this.updateTagOptions(this.tagOptions.filter(o => o.id !== id));
      // need to remove tag from all pages
      this.workspace.docCollection.docs.forEach(doc => {
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
    this.workspace.docCollection.setDocMeta(pageId, {
      tags,
    });
  };
}
