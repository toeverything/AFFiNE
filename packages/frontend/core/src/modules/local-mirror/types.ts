import { z } from 'zod';

export const LOCAL_MIRROR_FORMAT_VERSION = 1 as const;

export const LocalMirrorFileKindSchema = z.enum([
  'index',
  'workspace',
  'markdown',
  'snapshot',
  'asset',
]);

export const LocalMirrorManifestSchema = z.object({
  formatVersion: z.literal(LOCAL_MIRROR_FORMAT_VERSION),
  workspaceId: z.string().min(1),
  workspaceFlavour: z.string().min(1),
  generation: z.string().min(1),
  lastCompletedAt: z.string().datetime(),
  sourceSyncState: z.enum(['synced', 'cached-offline']),
  files: z.record(
    z.string(),
    z.object({
      kind: LocalMirrorFileKindSchema,
      sha256: z.string().min(1),
      docId: z.string().optional(),
      sourceHash: z.string().optional(),
    })
  ),
});

export const LocalMirrorDocMetadataSchema = z.object({
  id: z.string(),
  title: z.string(),
  createDate: z.number().optional(),
  updatedDate: z.number().optional(),
  trash: z.boolean().optional(),
  tags: z.array(z.string()),
  primaryMode: z.enum(['page', 'edgeless']),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const LocalMirrorFolderRecordSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable().optional(),
  data: z.string(),
  type: z.string(),
  index: z.string(),
});

export const LocalMirrorWorkspaceProjectionSchema = z.object({
  formatVersion: z.literal(LOCAL_MIRROR_FORMAT_VERSION),
  workspace: z.object({
    id: z.string(),
    name: z.string(),
    flavour: z.string(),
  }),
  generatedAt: z.string().datetime(),
  docs: z.array(
    LocalMirrorDocMetadataSchema.extend({
      path: z.string(),
      snapshotPath: z.string(),
    })
  ),
  folders: z.array(LocalMirrorFolderRecordSchema),
  tags: z.array(
    z.object({
      id: z.string(),
      value: z.string(),
      color: z.string().optional(),
    })
  ),
});

export type LocalMirrorManifest = z.infer<typeof LocalMirrorManifestSchema>;
export type LocalMirrorFileKind = z.infer<typeof LocalMirrorFileKindSchema>;

export type LocalMirrorDocMetadata = z.infer<
  typeof LocalMirrorDocMetadataSchema
>;

export type LocalMirrorFolderRecord = z.infer<
  typeof LocalMirrorFolderRecordSchema
>;

export type LocalMirrorWorkspaceProjection = z.infer<
  typeof LocalMirrorWorkspaceProjectionSchema
>;

export type LocalMirrorSerializedFile = {
  path: string;
  kind: LocalMirrorFileKind;
  content: string | Uint8Array;
  docId?: string;
  sourceHash?: string;
};

export type LocalMirrorSerializedDocument = {
  docId: string;
  sourceHash: string;
  files: LocalMirrorSerializedFile[];
};

export type LocalMirrorStatus =
  | { type: 'feature-disabled' }
  | { type: 'permission-denied' }
  | { type: 'disabled' }
  | { type: 'not-configured' }
  | { type: 'idle'; lastCompletedAt?: string }
  | { type: 'syncing'; completed: number; total: number }
  | { type: 'conflict'; paths: string[] }
  | { type: 'error'; message: string };

export type LocalMirrorConfig = {
  enabled: boolean;
  projectRoot: string | null;
};
