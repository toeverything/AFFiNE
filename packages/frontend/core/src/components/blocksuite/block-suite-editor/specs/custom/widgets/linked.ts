import { WorkspacePropertiesAdapter } from '@affine/core/modules/properties';
import { I18n, i18nTime } from '@affine/i18n';
import { track } from '@affine/track';
import type { EditorHost } from '@blocksuite/block-std';
import type { AffineInlineEditor } from '@blocksuite/blocks';
import { LinkedWidgetUtils } from '@blocksuite/blocks';
import {
  LinkedEdgelessIcon,
  LinkedPageIcon,
  TodayIcon,
} from '@blocksuite/icons/lit';
import type { DocMeta } from '@blocksuite/store';
import {
  DocsService,
  type FrameworkProvider,
  WorkspaceService,
} from '@toeverything/infra';

export function createLinkedWidgetConfig(framework: FrameworkProvider) {
  return {
    getMenus: (
      query: string,
      abort: () => void,
      editorHost: EditorHost,
      inlineEditor: AffineInlineEditor
    ) => {
      const currentWorkspace = framework.get(WorkspaceService).workspace;
      const rawMetas = currentWorkspace.docCollection.meta.docMetas;
      const adapter = framework.get(WorkspacePropertiesAdapter);
      const isJournal = (d: DocMeta) =>
        !!adapter.getJournalPageDateString(d.id);

      const docMetas = rawMetas
        .filter(meta => {
          if (isJournal(meta) && !meta.updatedDate) {
            return false;
          }
          return !meta.trash;
        })
        .map(meta => {
          if (isJournal(meta)) {
            const date = adapter.getJournalPageDateString(meta.id);
            if (date) {
              const title = i18nTime(date, { absolute: { accuracy: 'day' } });
              return { ...meta, title };
            }
          }
          if (!meta.title) {
            const title = I18n['Untitled']();
            return { ...meta, title };
          }
          return meta;
        })
        .filter(({ title }) => isFuzzyMatch(title, query));

      // TODO need i18n if BlockSuite supported
      const MAX_DOCS = 6;
      const docsService = framework.get(DocsService);
      const isEdgeless = (d: DocMeta) =>
        docsService.list.getPrimaryMode(d.id) === 'edgeless';
      return Promise.resolve([
        {
          name: 'Link to Doc',
          items: docMetas.map(doc => ({
            key: doc.id,
            name: doc.title,
            icon: isJournal(doc)
              ? TodayIcon()
              : isEdgeless(doc)
                ? LinkedEdgelessIcon()
                : LinkedPageIcon(),
            action: () => {
              abort();
              LinkedWidgetUtils.insertLinkedNode({
                inlineEditor,
                docId: doc.id,
              });
              track.doc.editor.atMenu.linkDoc();
            },
          })),
          maxDisplay: MAX_DOCS,
          overflowText: `${docMetas.length - MAX_DOCS} more docs`,
        },
        LinkedWidgetUtils.createNewDocMenuGroup(
          query,
          abort,
          editorHost,
          inlineEditor
        ),
      ]);
    },
  };
}

/**
 * Checks if the name is a fuzzy match of the query.
 *
 * @example
 * ```ts
 * const name = 'John Smith';
 * const query = 'js';
 * const isMatch = isFuzzyMatch(name, query);
 * // isMatch: true
 * ```
 */
function isFuzzyMatch(name: string, query: string) {
  const pureName = name
    .trim()
    .toLowerCase()
    .split('')
    .filter(char => char !== ' ')
    .join('');

  const regex = new RegExp(
    query
      .split('')
      .filter(char => char !== ' ')
      .map(item => `${escapeRegExp(item)}.*`)
      .join(''),
    'i'
  );
  return regex.test(pureName);
}

function escapeRegExp(input: string) {
  // escape regex characters in the input string to prevent regex format errors
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
