import type { ExtensionType, Schema, Workspace } from '@blocksuite/store';
// @ts-ignore
import { convertToHtml } from 'mammoth/mammoth.browser';

import { HtmlTransformer } from './html';

type ImportDocxOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
  extensions: ExtensionType[];
};

/**
 * Imports a .docx file into a doc.
 *
 * @param options - The import options.
 * @param options.collection - The target doc collection.
 * @param options.schema - The schema of the target doc collection.
 * @param options.imported - The .docx file as a Blob.
 * @returns A Promise that resolves to the ID of the newly created doc, or undefined if import fails.
 */
async function importDocx({
  collection,
  schema,
  imported,
  extensions,
}: ImportDocxOptions) {
  try {
    const { value } = await convertToHtml({
      arrayBuffer: await imported.arrayBuffer(),
    });
    return await HtmlTransformer.importHTMLToDoc({
      collection,
      schema,
      html: value,
      extensions,
    });
  } catch (e) {
    console.error('Failed to import .docx file:', e);
    return undefined;
  }
}

export const DocxTransformer = {
  importDocx,
};
