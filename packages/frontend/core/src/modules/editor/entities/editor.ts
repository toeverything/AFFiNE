import type {
  DocMode,
  EdgelessRootService,
  ReferenceParams,
} from '@blocksuite/affine/blocks';
import type {
  AffineEditorContainer,
  DocTitle,
} from '@blocksuite/affine/presets';
import type { InlineEditor } from '@blocksuite/inline';
import type { DocService, WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { defaults, isEqual, omit } from 'lodash-es';

import { paramsParseOptions, preprocessParams } from '../../navigation/utils';
import type { WorkbenchView } from '../../workbench';
import { EditorScope } from '../scopes/editor';
import type { EditorSelector } from '../types';

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
    const stablePrimaryMode = this.doc.getPrimaryMode();

    // eslint-disable-next-line rxjs/finnish
    const viewParams$ = view
      .queryString$<ReferenceParams & { refreshKey?: string }>(
        paramsParseOptions
      )
      .map(preprocessParams)
      .map(params =>
        defaults(params, {
          mode: stablePrimaryMode || ('page' as DocMode),
        })
      );

    const editorParams$ = LiveData.computed(get => {
      return {
        mode: get(this.mode$),
        ...get(this.selector$),
      };
    });

    // prevent infinite loop
    let updating = false;

    const unsubscribeViewParams = viewParams$.subscribe(params => {
      if (updating) return;
      updating = true;
      // when view params changed, sync to editor
      try {
        const editorParams = editorParams$.value;
        if (params.mode !== editorParams.mode) {
          this.setMode(params.mode);
        }

        const selector = omit(params, ['mode']);
        if (!isEqual(selector, omit(editorParams, ['mode']))) {
          this.setSelector(selector);
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
        if (!isEqual(params, viewParams$.value)) {
          const newQueryString: Record<string, string> = {};

          Object.entries(params).forEach(([k, v]) => {
            newQueryString[k] = Array.isArray(v) ? v.join(',') : v;
          });

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
      const mode = get(this.mode$);
      let id = selector?.blockIds?.[0];
      let key = 'blockIds';

      if (mode === 'edgeless') {
        const elementId = selector?.elementIds?.[0];
        if (elementId) {
          id = elementId;
          key = 'elementIds';
        }
      }

      if (!id) return null;

      return { id, key, mode, refreshKey: selector?.refreshKey };
    });
    if (focusAt$.value === null && docTitle) {
      const title = docTitle.querySelector<
        HTMLElement & { inlineEditor: InlineEditor | null }
      >('rich-text');
      title?.inlineEditor?.focusEnd();
    }

    const subscription = focusAt$
      .distinctUntilChanged(
        (a, b) =>
          a?.id === b?.id &&
          a?.key === b?.key &&
          a?.refreshKey === b?.refreshKey
      )
      .subscribe(anchor => {
        if (!anchor) return;

        const selection = editorContainer.host?.std.selection;
        if (!selection) return;

        const { id, key, mode } = anchor;

        selection.setGroup('scene', [
          selection.create('highlight', {
            mode,
            [key]: [id],
          }),
        ]);
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
