import { generateDocUpdate } from '@affine/nbstore';
import {
  catchErrorInto,
  effect,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
} from '@toeverything/infra';
import JSZip from 'jszip';
import { switchMap, tap } from 'rxjs';

import { WorkspacesService } from '../../workspace';
import { BaseBackupService } from './base';

export class WebBackupService extends BaseBackupService {
  constructor(private readonly workspacesService: WorkspacesService) {
    super();
  }

  isLoading$ = new LiveData(false);
  error$ = new LiveData<any>(null);
  pageBackupWorkspaces$ = new LiveData<any>(undefined);

  readonly revalidate = effect(
    switchMap(() =>
      fromPromise(async () => {
        // web version doesn't support listing archived backup workspaces
        return undefined;
      }).pipe(
        tap(data => {
          this.pageBackupWorkspaces$.setValue(data);
        }),
        catchErrorInto(this.error$),
        onStart(() => this.isLoading$.setValue(true)),
        onComplete(() => this.isLoading$.setValue(false))
      )
    )
  );

  async downloadBackup(workspaceId: string) {
    this.isLoading$.setValue(true);
    try {
      const workspaceMeta = this.workspacesService.list.workspaces$.value.find(
        w => w.id === workspaceId
      );
      if (!workspaceMeta) {
        throw new Error('Workspace not found');
      }
      const { workspace, dispose } = this.workspacesService.open({
        metadata: workspaceMeta,
      });

      try {
        // Wait for root doc to be ready before exporting
        await workspace.engine.doc.waitForDocReady(workspace.id);

        const zip = new JSZip();

        // 1. Export Info
        const info = {
          workspaceId,
          createdAt: new Date().toISOString(),
          version: 1,
        };
        zip.file('info.json', JSON.stringify(info, null, 2));

        // 2. Export Docs (Yjs binary updates)
        const docStorage = workspace.engine.doc.storage;
        const docTimestamps = await docStorage.getDocTimestamps();
        const docsFolder = zip.folder('docs');

        if (docsFolder) {
          for (const docId of Object.keys(docTimestamps)) {
            const doc = await docStorage.getDoc(docId);
            if (doc) {
              docsFolder.file(docId + '.bin', doc.bin);
            }
          }
        }

        // 3. Export Blobs with metadata manifest
        const blobStorage = workspace.engine.blob.storage;
        const blobsList = await blobStorage.list();
        const blobsFolder = zip.folder('blobs');

        const blobManifest: Record<string, { mime: string; size: number }> = {};

        if (blobsFolder) {
          for (const blobRecord of blobsList) {
            const blob = await blobStorage.get(blobRecord.key);
            if (blob) {
              blobsFolder.file(blobRecord.key, blob.data);
              blobManifest[blobRecord.key] = {
                mime: blob.mime,
                size: blobRecord.size,
              };
            }
          }
        }
        zip.file('blobs.json', JSON.stringify(blobManifest, null, 2));

        // Generate and trigger download
        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date()
          .toISOString()
          .replace(/[:.]/g, '-')
          .slice(0, 19);
        a.download = `workspace-backup-${timestamp}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } finally {
        dispose();
      }
    } catch (e) {
      console.error('Failed to export backup', e);
      this.error$.setValue(e);
    } finally {
      this.isLoading$.setValue(false);
    }
  }

  async importBackup(file: File): Promise<string> {
    this.isLoading$.setValue(true);
    try {
      const zip = await JSZip.loadAsync(file);

      // Validate backup file
      const infoFile = zip.file('info.json');
      if (!infoFile) {
        throw new Error('Invalid backup file: info.json missing');
      }

      const info = JSON.parse(await infoFile.async('string'));
      const workspaceId = info.workspaceId;

      if (!workspaceId) {
        throw new Error(
          'Invalid backup file: workspaceId missing in info.json'
        );
      }

      // Load blob manifest if available
      const blobManifestFile = zip.file('blobs.json');
      let blobManifest: Record<string, { mime: string; size: number }> = {};
      if (blobManifestFile) {
        blobManifest = JSON.parse(await blobManifestFile.async('string'));
      }

      // Find existing workspace
      const workspaceMeta = this.workspacesService.list.workspaces$.value.find(
        w => w.id === workspaceId
      );

      if (!workspaceMeta) {
        throw new Error(`Workspace ${workspaceId} not found`);
      }

      const { workspace, dispose } = this.workspacesService.open({
        metadata: workspaceMeta,
      });

      try {
        // Wait for root doc to be ready
        await workspace.engine.doc.waitForDocReady(workspace.id);

        const docStorage = workspace.engine.doc.storage;
        const blobStorage = workspace.engine.blob.storage;

        // Restore Docs
        const docsFolder = zip.folder('docs');
        if (docsFolder) {
          const docEntries = Object.entries(docsFolder.files).filter(
            ([path, entry]) => path.startsWith('docs/') && !entry.dir
          );

          for (const [filePath, entry] of docEntries) {
            const fileName = filePath.split('/').pop();
            if (!fileName) continue;
            const docId = fileName.replace('.bin', '');
            const docData = await entry.async('uint8array');
            if (docData) {
              const currentDoc = await docStorage.getDoc(docId);
              if (currentDoc) {
                const docUpdateBin = generateDocUpdate(currentDoc.bin, docData);
                await docStorage.pushDocUpdate({
                  docId: docId,
                  bin: docUpdateBin,
                });
              }
            }
          }
        }

        // Restore Blobs
        const blobsFolder = zip.folder('blobs');
        if (blobsFolder) {
          const blobEntries = Object.entries(blobsFolder.files).filter(
            ([path, entry]) => path.startsWith('blobs/') && !entry.dir
          );

          for (const [filePath, entry] of blobEntries) {
            const key = filePath.split('/').pop();
            if (!key) continue;
            const blobData = await entry.async('uint8array');
            if (blobData) {
              const mime =
                blobManifest[key]?.mime || 'application/octet-stream';
              await blobStorage.set({
                key,
                data: blobData,
                mime,
              });
            }
          }
        }

        return workspaceId;
      } finally {
        dispose();
      }
    } catch (e) {
      console.error('Failed to import backup', e);
      this.error$.setValue(e);
      throw e;
    } finally {
      this.isLoading$.setValue(false);
    }
  }

  // These methods are desktop-only and not applicable on web
  async recoverBackupWorkspace(_dbPath: string): Promise<string> {
    throw new Error('Not supported on web platform');
  }

  async deleteBackupWorkspace(_backupWorkspaceId: string): Promise<void> {
    throw new Error('Not supported on web platform');
  }

  override dispose(): void {
    this.revalidate.unsubscribe();
  }
}
