import { DocDisplayMetaService } from '@affine/core/modules/doc-display-meta';
import { JournalService } from '@affine/core/modules/journal';
import { I18n } from '@affine/i18n';
import { track } from '@affine/track';
import type { EditorHost } from '@blocksuite/affine/block-std';
import type { AffineInlineEditor } from '@blocksuite/affine/blocks';
import { LinkedWidgetUtils } from '@blocksuite/affine/blocks';
import type { DocMeta } from '@blocksuite/affine/store';
import { type FrameworkProvider, WorkspaceService } from '@toeverything/infra';

// TODO: fix the type
export function createLinkedWidgetConfig(
  framework: FrameworkProvider
): Partial<Record<string, unknown>> {
  return {
    getMenus: (
      query: string,
      abort: () => void,
      editorHost: EditorHost,
      inlineEditor: AffineInlineEditor
    ) => {
      const currentWorkspace = framework.get(WorkspaceService).workspace;
      const rawMetas = currentWorkspace.docCollection.meta.docMetas;
      const journalService = framework.get(JournalService);
      const isJournal = (d: DocMeta) =>
        !!journalService.journalDate$(d.id).value;

      const docDisplayMetaService = framework.get(DocDisplayMetaService);
      const docMetas = rawMetas
        .filter(meta => {
          if (isJournal(meta) && !meta.updatedDate) {
            return false;
          }
          return !meta.trash;
        })
        .map(meta => {
          const title = docDisplayMetaService.title$(meta.id, {
            reference: true,
          }).value;
          return {
            ...meta,
            title: I18n.t(title),
          };
        })
        .filter(({ title }) => isFuzzyMatch(title, query));

      // TODO need i18n if BlockSuite supported
      const MAX_DOCS = 6;
      return Promise.resolve([
        {
          name: 'Link to Doc',
          items: docMetas.map(doc => ({
            key: doc.id,
            name: doc.title,
            icon: docDisplayMetaService
              .icon$(doc.id, {
                type: 'lit',
                reference: true,
              })
              .value(),
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
