import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { ImportCommitService } from '@affine/core/desktop/dialogs/import/commit-service';
import { commitNativeImport } from '@affine/core/desktop/dialogs/import/native-backend';
import {
  preflightWebFilesImport,
  preflightWebZipImport,
} from '@affine/core/desktop/dialogs/import/web-limits';
import { DebugLogger } from '@affine/debug';
import { snapshotFile } from '@blocksuite/affine/shared/utils';
import {
  BearTransformer,
  type ImportWarning,
  MarkdownTransformer,
  NotionHtmlTransformer,
  ObsidianTransformer,
  Unzip,
} from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import type { ExplorerIconService } from '../../explorer-icon/services/explorer-icon';
import type { OrganizeService } from '../../organize';
import type { TagService } from '../../tag';
import type { WorkspaceService } from '../../workspace';
import { getAFFiNEWorkspaceSchema } from '../../workspace';

const logger = new DebugLogger('import');

export type ImportRunContext = {
  signal?: AbortSignal;
  onProgress?: (progress: { completed: number; total: number }) => void;
};

export class ImportService extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly organizeService: OrganizeService,
    private readonly explorerIconService: ExplorerIconService,
    private readonly tagService: TagService
  ) {
    super();
  }

  async importMarkdownZip(file: File, context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({ organize: true });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('markdownZip', file, commitService, context);
    }

    await preflightWebZipImport(file);
    const snapshot = await snapshotFile(file);
    const { batch } = await MarkdownTransformer.planMarkdownZip({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      imported: snapshot,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    return commitService.commitBatch(batch);
  }

  async importNotionZip(file: File, context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({
      organize: true,
      explorerIcon: true,
    });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('notionZip', file, commitService, context);
    }

    await preflightWebZipImport(file);
    const snapshot = await snapshotFile(file);
    const format = await detectNotionZipFormat(snapshot);
    if (format === 'markdown') {
      const { batch } = await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema: getAFFiNEWorkspaceSchema(),
        imported: snapshot,
        extensions: getStoreManager().config.init().value.get('store'),
      });
      return commitService.commitBatch(batch);
    }
    const { batch } = await NotionHtmlTransformer.planNotionHtmlZip({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      imported: snapshot,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    return commitService.commitBatch(batch);
  }

  async importObsidianVault(files: File[], context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({
      explorerIcon: true,
    });
    if (!BUILD_CONFIG.isElectron) {
      await preflightWebFilesImport(files);
    }
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('obsidian', files, commitService, context);
    }
    const { files: snapshots, warnings } = await snapshotReadableFiles(files);
    if (!snapshots.length) {
      throw new Error('No readable files were found in the selected folder.');
    }

    const { batch } = await ObsidianTransformer.planObsidianVault({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      importedFiles: snapshots,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    batch.warnings = [...(batch.warnings ?? []), ...warnings];
    return commitService.commitBatch(batch);
  }

  async importBearBackup(file: File, context?: ImportRunContext) {
    const collection = this.workspaceService.workspace.docCollection;
    const commitService = this.createCommitService({
      organize: true,
      tag: true,
    });
    if (BUILD_CONFIG.isElectron) {
      return commitNativeImport('bearZip', file, commitService, context);
    }

    await preflightWebZipImport(file);
    const snapshot = await snapshotFile(file);
    const { batch } = await BearTransformer.planBearBackup({
      collection,
      schema: getAFFiNEWorkspaceSchema(),
      imported: snapshot,
      extensions: getStoreManager().config.init().value.get('store'),
    });
    return commitService.commitBatch(batch);
  }

  async importOneNote(file: File, context?: ImportRunContext) {
    if (!BUILD_CONFIG.isElectron) {
      throw new Error('OneNote import is only available in the desktop app.');
    }
    const commitService = this.createCommitService({
      organize: true,
    });
    return commitNativeImport('oneNote', file, commitService, context);
  }

  private createCommitService(options: {
    organize?: boolean;
    explorerIcon?: boolean;
    tag?: boolean;
  }) {
    return new ImportCommitService({
      collection: this.workspaceService.workspace.docCollection,
      schema: getAFFiNEWorkspaceSchema(),
      extensions: getStoreManager().config.init().value.get('store'),
      organizeService: options.organize ? this.organizeService : undefined,
      explorerIconService: options.explorerIcon
        ? this.explorerIconService
        : undefined,
      tagService: options.tag ? this.tagService : undefined,
      logger,
    });
  }
}

async function detectNotionZipFormat(file: File): Promise<'markdown' | 'html'> {
  const unzip = new Unzip();
  await unzip.load(file);
  let hasHtml = false;
  for (const entry of unzip) {
    const lower = entry.path.toLowerCase();
    if (lower.endsWith('.md')) return 'markdown';
    if (lower.endsWith('.html') && !lower.endsWith('/index.html')) {
      hasHtml = true;
    }
  }
  if (hasHtml) return 'html';
  throw new Error('No Notion Markdown or HTML pages found in the archive');
}

async function snapshotReadableFiles(files: File[]) {
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
