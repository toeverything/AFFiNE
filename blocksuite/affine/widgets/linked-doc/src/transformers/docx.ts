import type { Schema, Workspace } from '@blocksuite/store';
import mammoth from 'mammoth';

import { HtmlTransformer } from './html';

type ImportDocxOptions = {
  collection: Workspace;
  schema: Schema;
  imported: Blob;
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
async function importDocx({ collection, schema, imported }: ImportDocxOptions) {
  const { value } = await mammoth.convertToHtml({
    arrayBuffer: await imported.arrayBuffer(),
  });
  return await HtmlTransformer.importHTMLToDoc({
    collection,
    schema,
    html: value,
  });
}

export const DocxTransformer = {
  importDocx,
};
