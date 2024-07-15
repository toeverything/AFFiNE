import {
  appInfo,
  TabViewsMetaKey,
  type TabViewsMetaSchema,
  tabViewsMetaSchema,
  type WorkbenchMeta,
  type WorkbenchViewMeta,
} from '@affine/electron-api';
import { I18n, type I18nKeys, i18nTime } from '@affine/i18n';
import type { GlobalState } from '@toeverything/infra';
import {
  createIdentifier,
  LiveData,
  Service,
  toLiveDataWithSetter,
} from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { distinctUntilChanged, map } from 'rxjs';

import { resolveRouteLinkMeta } from '../../navigation';
import type { RouteModulePath } from '../../navigation/utils';
import type { WorkspacePropertiesAdapter } from '../../properties';

export interface WorkbenchStateProvider {
  // not using LiveData for ease of side effect control on setting new values
  basename$: LiveData<string>;

  views$: LiveData<WorkbenchViewMeta[]>;

  activeViewIndex$: LiveData<number>;
}

export const WorkbenchStateProvider = createIdentifier<WorkbenchStateProvider>(
  'WorkbenchStateProvider'
);

export class InMemoryWorkbenchState
  extends Service
  implements WorkbenchStateProvider
{
  basename$ = new LiveData('/');

  // always have a default view
  views$ = new LiveData<WorkbenchViewMeta[]>([
    {
      id: nanoid(),
    },
  ]);

  activeViewIndex$ = new LiveData(0);
}

export class TabViewsMetaState extends Service {
  constructor(private readonly globalState: GlobalState) {
    super();
  }

  value$ = this.globalState.watch(TabViewsMetaKey).pipe(
    map(v => {
      return tabViewsMetaSchema.parse(v ?? {});
    })
  );

  set value(v: TabViewsMetaSchema) {
    this.globalState.set(TabViewsMetaKey, v);
  }

  get value() {
    return tabViewsMetaSchema.parse(
      this.globalState.get(TabViewsMetaKey) ?? {}
    );
  }

  patch(patch: Partial<TabViewsMetaSchema>) {
    this.value = {
      ...this.value,
      ...patch,
    };
  }
}

const routeModuleToI18n = {
  all: 'All pages',
  collection: 'Collections',
  tag: 'Tags',
  trash: 'Trash',
} satisfies Record<RouteModulePath, I18nKeys>;

export class DesktopWorkbenchState
  extends Service
  implements WorkbenchStateProvider
{
  constructor(
    private readonly tabViewMeta: TabViewsMetaState,
    private readonly workspaceProperties: WorkspacePropertiesAdapter
  ) {
    super();
  }

  toFullUrl(
    basename: string,
    location: { hash?: string; pathname: string; search?: string }
  ) {
    return basename + location.pathname + location.search + location.hash;
  }

  // fill tab view meta with title & moduleName
  fillTabViewMeta(
    workbench: WorkbenchMeta,
    view: WorkbenchViewMeta
  ): WorkbenchViewMeta | undefined {
    if (!view.path) {
      return;
    }

    const url = this.toFullUrl(workbench.basename, view.path);
    const linkMeta = resolveRouteLinkMeta(url);

    if (!linkMeta) {
      return;
    }
    const journalString =
      linkMeta.moduleName === 'doc'
        ? this.workspaceProperties.getJournalPageDateString(linkMeta.docId)
        : undefined;
    const isJournal = !!journalString;

    const title = (() => {
      if (linkMeta?.moduleName === 'doc') {
        if (journalString) {
          return i18nTime(journalString, { absolute: { accuracy: 'day' } });
        }
        return (
          this.workspaceProperties.workspace.docCollection.meta.getDocMeta(
            linkMeta.docId
          )?.title || I18n['Untitled']()
        );
      } else {
        return I18n[routeModuleToI18n[linkMeta.moduleName]]();
      }
    })();

    return {
      ...view,
      title: title,
      moduleName: isJournal ? 'journal' : linkMeta.moduleName,
    };
  }

  workbenchMeta$ = this.tabViewMeta.value$.pipe(
    map(v => {
      return v.workbenches.find(w => w.key === appInfo?.tabViewKey);
    })
  );

  get workbenchMeta() {
    return this.tabViewMeta.value.workbenches.find(
      w => w.key === appInfo?.tabViewKey
    );
  }

  setWorkbenchMeta(meta: TabViewsMetaSchema['workbenches'][number]) {
    this.tabViewMeta.patch({
      workbenches: this.tabViewMeta.value.workbenches.map(w => {
        if (w.key === appInfo?.tabViewKey) {
          return {
            ...w,
            ...meta,
            views: meta.views.map(v => {
              return this.fillTabViewMeta(meta, v) ?? v;
            }),
          };
        } else {
          return w;
        }
      }),
    });
  }

  patchWorkbenchMeta(
    patch: Partial<TabViewsMetaSchema['workbenches'][number]>
  ) {
    if (this.workbenchMeta) {
      this.setWorkbenchMeta({
        ...this.workbenchMeta,
        ...patch,
      });
    }
  }

  basename$ = toLiveDataWithSetter(
    this.workbenchMeta$.pipe(
      map(v => v?.basename ?? '/'),
      distinctUntilChanged()
    ),
    '/',
    v => this.patchWorkbenchMeta({ basename: v })
  );

  views$ = toLiveDataWithSetter(
    this.workbenchMeta$.pipe(map(v => v?.views ?? [])),
    [],
    v => {
      this.patchWorkbenchMeta({ views: v });
    }
  );

  activeViewIndex$ = toLiveDataWithSetter(
    this.workbenchMeta$.pipe(
      map(v => v?.activeViewIndex ?? 0),
      distinctUntilChanged()
    ),
    0,
    v => {
      this.patchWorkbenchMeta({ activeViewIndex: v });
    }
  );
}
