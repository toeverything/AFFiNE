import type { PagesPropertiesMeta, Tag } from '@blocksuite/store';
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
    return this.workspace.blockSuiteWorkspace.meta.properties;
  }
  get tagOptions() {
    return this.properties.tags?.options ?? [];
  }

  updateProperties = (properties: PagesPropertiesMeta) => {
    this.workspace.blockSuiteWorkspace.meta.setProperties(properties);
  };

  subscribe(cb: () => void) {
    const disposable =
      this.workspace.blockSuiteWorkspace.meta.pageMetasUpdated.on(cb);
    return disposable.dispose;
  }

  properties$ = LiveData.from(
    new Observable<PagesPropertiesMeta>(sub => {
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
    this.workspace.blockSuiteWorkspace.doc.transact(() => {
      this.updateTagOptions(this.tagOptions.filter(o => o.id !== id));
      // need to remove tag from all pages
      this.workspace.blockSuiteWorkspace.pages.forEach(page => {
        const tags = page.meta.tags ?? [];
        if (tags.includes(id)) {
          this.updatePageTags(
            page.id,
            tags.filter(t => t !== id)
          );
        }
      });
    });
  };

  updatePageTags = (pageId: string, tags: string[]) => {
    this.workspace.blockSuiteWorkspace.setPageMeta(pageId, {
      tags,
    });
  };
}
