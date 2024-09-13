import type { DocMode, EdgelessRootService } from '@blocksuite/blocks';
import type { InlineEditor } from '@blocksuite/inline';
import type { AffineEditorContainer, DocTitle } from '@blocksuite/presets';
import type { DocService, WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { isEqual } from 'lodash-es';

import type { WorkbenchView } from '../../workbench';
import { EditorScope } from '../scopes/editor';
import type { EditorSelector } from '../types';
import { scrollAnchoring } from '../utils/scroll-anchoring';

export class Editor extends Entity {
  readonly scope = this.framework.createScope(EditorScope, {
    editor: this as Editor,
  });

  readonly mode$ = new LiveData<DocMode>('page');
  readonly selector$ = new LiveData<EditorSelector | undefined>(undefined);
  readonly doc = this.docService.doc;
  readonly isSharedMode =
    this.workspaceService.workspace.openOptions.isSharedMode;

  readonly editorContainer$ = new LiveData<AffineEditorContainer | null>(null);

  isPresenting$ = new LiveData<boolean>(false);

  togglePresentation() {
    const edgelessRootService =
      this.editorContainer$.value?.host?.std.getService(
        'affine:page'
      ) as EdgelessRootService;
    if (!edgelessRootService) return;

    edgelessRootService.tool.setEdgelessTool({
      type: !this.isPresenting$.value ? 'frameNavigator' : 'default',
    });
  }

  setSelector(selector: EditorSelector | undefined) {
    this.selector$.next(selector);
  }

  toggleMode() {
    this.mode$.next(this.mode$.value === 'edgeless' ? 'page' : 'edgeless');
  }

  setMode(mode: DocMode) {
    this.mode$.next(mode);
  }

  setEditorContainer(editorContainer: AffineEditorContainer | null) {
    this.editorContainer$.next(editorContainer);
  }

  /**
   * sync editor params with view query string
   */
  bindWorkbenchView(view: WorkbenchView) {
    // eslint-disable-next-line rxjs/finnish
    const viewParams$ = view.queryString$<{
      mode?: DocMode;
      blockIds?: string[];
      elementIds?: string[];
      refreshKey?: string;
    }>({
      // Cannot handle single id situation correctly: `blockIds=xxx`
      arrayFormat: 'none',
      types: {
        mode: value =>
          value === 'page' || value === 'edgeless' ? value : undefined,
        blockIds: value => (value.length ? value.split(',') : []),
        elementIds: value => (value.length ? value.split(',') : []),
        refreshKey: 'string',
      },
    });

    const stablePrimaryMode = this.doc.getPrimaryMode();

    const editorParams$ = LiveData.computed(get => {
      const selector = get(this.selector$);
      return {
        mode: get(this.mode$),
        blockIds: selector?.blockIds,
        elementIds: selector?.elementIds,
        refreshKey: selector?.refreshKey,
      };
    });

    // prevent infinite loop
    let updating = false;

    const unsubscribeViewParams = viewParams$.subscribe(params => {
      if (updating) return;
      updating = true;
      // when view params changed, sync to editor
      try {
        const mode =
          viewParams$.value.mode || stablePrimaryMode || ('page' as DocMode);
        if (mode !== editorParams$.value.mode) {
          this.setMode(mode);
        }
        const newSelector = {
          blockIds: params.blockIds,
          elementIds: params.elementIds,
          refreshKey: params.refreshKey,
        };
        if (!isEqual(newSelector, editorParams$.value)) {
          this.setSelector({
            blockIds: params.blockIds,
            elementIds: params.elementIds,
            refreshKey: params.refreshKey,
          });
        }
      } finally {
        updating = false;
      }
    });

    const unsubscribeEditorParams = editorParams$.subscribe(params => {
      if (updating) return;
      updating = true;
      try {
        // when editor params changed, sync to view
        const newQueryString: any = {};
        let updated = false;
        if (params.mode !== viewParams$.value.mode) {
          newQueryString.mode = params.mode;
          updated = true;
        }
        const stringBlockIds = params.blockIds?.join(',');
        const stringElementIds = params.elementIds?.join(',');
        const stringViewBlockIds = viewParams$.value.blockIds?.join(',');
        const stringViewElementIds = viewParams$.value.elementIds?.join(',');
        if (
          stringBlockIds !== stringViewBlockIds ||
          stringElementIds !== stringViewElementIds ||
          params.refreshKey !== viewParams$.value.refreshKey
        ) {
          newQueryString.blockIds = stringBlockIds;
          newQueryString.elementIds = stringElementIds;
          newQueryString.refreshKey = params.refreshKey;
          updated = true;
        }

        if (updated) {
          view.updateQueryString(newQueryString, { replace: true });
        }
      } finally {
        updating = false;
      }
    });

    return () => {
      unsubscribeEditorParams.unsubscribe();
      unsubscribeViewParams.unsubscribe();
    };
  }

  bindEditorContainer(
    editorContainer: AffineEditorContainer,
    docTitle: DocTitle | null
  ) {
    const unsubs: (() => void)[] = [];

    const focusAt$ = LiveData.computed(get => {
      const selector = get(this.selector$);
      const id =
        get(this.mode$) === 'edgeless' && selector?.elementIds?.length
          ? selector?.elementIds?.[0]
          : selector?.blockIds?.[0];
      if (id) {
        return { id, refreshKey: selector?.refreshKey };
      } else {
        return null;
      }
    });
    if (focusAt$.value === null && docTitle) {
      const title = docTitle.querySelector<
        HTMLElement & { inlineEditor: InlineEditor | null }
      >('rich-text');
      title?.inlineEditor?.focusEnd();
    }

    const subscription = focusAt$
      .distinctUntilChanged(
        (a, b) => a?.id === b?.id && a?.refreshKey === b?.refreshKey
      )
      .subscribe(params => {
        if (params?.id) {
          const std = editorContainer.host?.std;
          if (std) {
            scrollAnchoring(std, this.mode$.value, params.id);
          }
        }
      });
    unsubs.push(subscription.unsubscribe.bind(subscription));

    const edgelessPage = editorContainer.host?.querySelector(
      'affine-edgeless-root'
    );
    if (!edgelessPage) {
      this.isPresenting$.next(false);
    } else {
      this.isPresenting$.next(
        edgelessPage.edgelessTool.type === 'frameNavigator'
      );

      const disposable = edgelessPage.slots.edgelessToolUpdated.on(() => {
        this.isPresenting$.next(
          edgelessPage.edgelessTool.type === 'frameNavigator'
        );
      });
      unsubs.push(disposable.dispose.bind(disposable));
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }

  constructor(
    private readonly docService: DocService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }
}
