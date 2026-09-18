import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { NoteDisplayMode } from '@blocksuite/affine/model';
import { Text } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';

import type { WorkspaceService } from '../../workspace';

const plainTextMarkdownComplexityLimits = {
  characters: 1_000_000,
  lines: 20_000,
  headings: 3_000,
  tableRows: 8_000,
  fences: 1_000,
};
const plainTextMarkdownPreviewCharacters = 0;
const plainTextMarkdownPreviewChunkSize = 4_000;

export function getMarkdownImportComplexity(markdown: string) {
  let lines = 1;
  let headings = 0;
  let tableRows = 0;
  let fences = 0;
  let lineStart = 0;

  for (let index = 0; index <= markdown.length; index++) {
    if (index !== markdown.length && markdown.charCodeAt(index) !== 10) {
      continue;
    }

    const line = markdown.slice(lineStart, index).trimStart();
    if (/^#{1,6}\s/.test(line)) {
      headings++;
    }
    if (line.startsWith('|')) {
      tableRows++;
    }
    if (line.startsWith('```')) {
      fences++;
    }
    if (index !== markdown.length) {
      lines++;
    }
    lineStart = index + 1;
  }

  return {
    characters: markdown.length,
    lines,
    headings,
    tableRows,
    fences,
  };
}

export function shouldUsePlainTextMarkdownImport(markdown: string) {
  const complexity = getMarkdownImportComplexity(markdown);
  return (
    complexity.characters > plainTextMarkdownComplexityLimits.characters ||
    complexity.lines > plainTextMarkdownComplexityLimits.lines ||
    complexity.headings > plainTextMarkdownComplexityLimits.headings ||
    complexity.tableRows > plainTextMarkdownComplexityLimits.tableRows ||
    complexity.fences > plainTextMarkdownComplexityLimits.fences
  );
}

function getDocPageForMarkdownReplace(options: {
  workspace: WorkspaceService['workspace'];
  docId: string;
}) {
  const doc = options.workspace.docCollection.getDoc(options.docId)?.getStore();
  if (!doc) {
    throw new Error('Doc not found');
  }

  const pageBlock = doc.getBlocksByFlavour('affine:page')[0];
  if (!pageBlock) {
    throw new Error('Page block not found');
  }

  if (!doc.getBlocksByFlavour('affine:surface')[0]) {
    doc.addBlock('affine:surface' as never, {}, pageBlock.id);
  }

  return { doc, pageBlock };
}

type MarkdownReplaceDocPage = ReturnType<typeof getDocPageForMarkdownReplace>;

function deletePreviousMarkdownContent(options: {
  doc: MarkdownReplaceDocPage['doc'];
  pageBlock: MarkdownReplaceDocPage['pageBlock'];
  nextNoteBlockId: string;
}) {
  const children = options.pageBlock.model.children.filter(
    child => child.flavour !== 'affine:surface'
  );
  for (let index = children.length - 1; index >= 0; index--) {
    if (children[index].id === options.nextNoteBlockId) {
      continue;
    }
    options.doc.deleteBlock(children[index]);
  }
}

function createMarkdownNote(
  options: ReturnType<typeof getDocPageForMarkdownReplace>
) {
  return options.doc.addBlock(
    'affine:note',
    {
      displayMode: NoteDisplayMode.DocAndEdgeless,
    },
    options.pageBlock.id
  );
}

export async function replaceDocWithMarkdown(options: {
  workspace: WorkspaceService['workspace'];
  docId: string;
  markdown: string;
}) {
  const docPage = getDocPageForMarkdownReplace(options);
  const noteBlockId = createMarkdownNote(docPage);
  try {
    await MarkdownTransformer.importMarkdownToBlock({
      doc: docPage.doc,
      blockId: noteBlockId,
      markdown: options.markdown,
      extensions: getStoreManager().config.init().value.get('store'),
    });
  } catch (error) {
    docPage.doc.deleteBlock(noteBlockId);
    throw error;
  }
  deletePreviousMarkdownContent({ ...docPage, nextNoteBlockId: noteBlockId });
}

export async function replaceDocWithPlainTextMarkdown(options: {
  workspace: WorkspaceService['workspace'];
  docId: string;
  markdown: string;
  sourceFilePath?: string;
  chunkSize?: number;
}) {
  const docPage = getDocPageForMarkdownReplace(options);
  const noteBlockId = createMarkdownNote(docPage);
  const chunkSize = options.chunkSize ?? plainTextMarkdownPreviewChunkSize;
  const complexity = getMarkdownImportComplexity(options.markdown);
  const preview = options.markdown.slice(0, plainTextMarkdownPreviewCharacters);
  const omittedCharacters = Math.max(
    0,
    options.markdown.length - preview.length
  );
  const summaryLines = [
    'Large Markdown compatibility preview',
    '',
    'This file is too complex to render as editable AFFiNE blocks without freezing the editor.',
    options.sourceFilePath ? `Source file: ${options.sourceFilePath}` : null,
    `Characters: ${complexity.characters}`,
    `Lines: ${complexity.lines}`,
    `Headings: ${complexity.headings}`,
    `Table rows: ${complexity.tableRows}`,
    `Code fences: ${complexity.fences}`,
    omittedCharacters > 0
      ? `Preview is disabled for this file to keep AFFiNE responsive. ${omittedCharacters} characters remain in the source Markdown file.`
      : `Preview: full source shown.`,
    '',
    'Open the source Markdown file in an external editor for the full raw content.',
  ].filter((line): line is string => line !== null);

  docPage.doc.addBlock(
    'affine:paragraph',
    {
      text: new Text(summaryLines.join('\n')),
    },
    noteBlockId
  );

  for (let offset = 0; offset < preview.length; offset += chunkSize) {
    const chunk = preview.slice(offset, offset + chunkSize);
    docPage.doc.addBlock(
      'affine:paragraph',
      {
        text: new Text(chunk),
      },
      noteBlockId
    );
  }
  deletePreviousMarkdownContent({ ...docPage, nextNoteBlockId: noteBlockId });
}
