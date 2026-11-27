import { snapshotFile } from '@blocksuite/affine/shared/utils';
import type { ImportWarning } from '@blocksuite/affine/widgets/linked-doc';

export async function snapshotReadableFiles(files: File[]) {
  const snapshots: File[] = [];
  const warnings: ImportWarning[] = [];
  for (const file of files) {
    try {
      snapshots.push(await snapshotFile(file));
    } catch (error) {
      const sourcePath = file.webkitRelativePath || file.name;
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push({
        code: 'file-unreadable',
        message: `Skipped unreadable file: ${sourcePath}. ${reason}`,
        sourcePath,
      });
    }
  }
  return { files: snapshots, warnings };
}

export async function importFilesAsDocs(
  files: File[],
  importFile: (file: File) => Promise<string | undefined>
) {
  const { files: readableFiles, warnings } = await snapshotReadableFiles(files);
  const docIds: string[] = [];
  for (const file of readableFiles) {
    const docId = await importFile(file);
    if (docId) {
      docIds.push(docId);
    } else {
      warnings.push({
        code: 'skipped_doc',
        message: `Skipped ${file.name}: the file could not be converted to a document`,
        sourcePath: file.name,
      });
    }
  }
  return { docIds, warnings };
}
