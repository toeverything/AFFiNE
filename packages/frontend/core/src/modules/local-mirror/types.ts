import { z } from 'zod';

export const LOCAL_MIRROR_V1_FORMAT_VERSION = 1 as const;
export const LOCAL_MIRROR_FORMAT_VERSION = 2 as const;
export const LOCAL_MIRROR_MAX_FILE_BYTES = 128 * 1024 * 1024;

export const LocalMirrorFileKindSchema = z.enum([
  'index',
  'workspace',
  'markdown',
  'snapshot',
  'asset',
  'baseline',
]);

const LocalMirrorV1FileKindSchema = LocalMirrorFileKindSchema.exclude([
  'baseline',
]);

const LocalMirrorManifestFileSchema = z.object({
  kind: LocalMirrorFileKindSchema,
  sha256: z.string().min(1),
  docId: z.string().optional(),
  sourceHash: z.string().optional(),
});

export const LocalMirrorManifestV1Schema = z.object({
  formatVersion: z.literal(LOCAL_MIRROR_V1_FORMAT_VERSION),
  workspaceId: z.string().min(1),
  workspaceFlavour: z.string().min(1),
  generation: z.string().min(1),
  lastCompletedAt: z.string().datetime(),
  sourceSyncState: z.enum(['synced', 'cached-offline']),
  files: z.record(
    z.string(),
    LocalMirrorManifestFileSchema.extend({ kind: LocalMirrorV1FileKindSchema })
  ),
});

const LocalMirrorManifestV2FileSchema = z.union([
  LocalMirrorManifestFileSchema.extend({
    kind: z.literal('markdown'),
    baselinePath: z.string().min(1),
    markerGrammarVersion: z.literal(1),
    baseMarkdownHash: z.string().min(1),
    baseSourceHash: z.string().min(1),
  }),
  LocalMirrorManifestFileSchema.extend({
    kind: LocalMirrorFileKindSchema.exclude(['markdown']),
  }),
]);

export const LocalMirrorManifestV2Schema = LocalMirrorManifestV1Schema.extend({
  formatVersion: z.literal(LOCAL_MIRROR_FORMAT_VERSION),
  files: z.record(z.string(), LocalMirrorManifestV2FileSchema),
});

export const LocalMirrorManifestSchema = z.union([
  LocalMirrorManifestV1Schema,
  LocalMirrorManifestV2Schema,
]);

export const LocalMirrorBaselineBlockSchema = z.object({
  id: z.string().min(1),
  flavour: z.string().min(1),
  parentId: z.string().min(1),
  siblingIndex: z.number().int().nonnegative(),
  projectionHash: z.string().min(1),
  protected: z.boolean(),
});

export const LocalMirrorBaselineDescriptorSchema = z.object({
  formatVersion: z.literal(LOCAL_MIRROR_FORMAT_VERSION),
  docId: z.string().min(1),
  markdownPath: z.string().min(1),
  baselinePath: z.string().min(1),
  markerGrammarVersion: z.literal(1),
  sourceHash: z.string().min(1),
  protected: z.boolean(),
  protectedReasons: z.array(z.string()),
  blocks: z.array(LocalMirrorBaselineBlockSchema),
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
export type LocalMirrorManifestV1 = z.infer<typeof LocalMirrorManifestV1Schema>;
export type LocalMirrorManifestV2 = z.infer<typeof LocalMirrorManifestV2Schema>;
export type LocalMirrorFileKind = z.infer<typeof LocalMirrorFileKindSchema>;
export type LocalMirrorBaselineDescriptor = z.infer<
  typeof LocalMirrorBaselineDescriptorSchema
>;

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

export type LocalMirrorSerializedAsset = {
  assetId: string;
  path: string;
  kind: 'asset';
  docId: string;
};

export type LocalMirrorSerializedDocument = {
  docId: string;
  sourceHash: string;
  files: LocalMirrorSerializedFile[];
  assets: LocalMirrorSerializedAsset[];
};

export type LocalMirrorStatus =
  | { type: 'feature-disabled' }
  | { type: 'permission-denied'; docId?: string; path?: string }
  | { type: 'disabled' }
  | { type: 'not-configured' }
  | { type: 'idle'; lastCompletedAt?: string }
  | { type: 'syncing'; completed: number; total: number }
  | { type: 'importing'; completed: number; total: number }
  | { type: 'external-change-pending'; message: string }
  | { type: 'merge-conflict'; path: string; reason: string }
  | { type: 'unsupported-local-change'; paths: string[]; message: string }
  | { type: 'migration-conflict'; paths: string[] }
  | { type: 'conflict'; paths: string[] }
  | { type: 'error'; message: string };

export type LocalMirrorConfig = {
  enabled: boolean;
  projectRoot: string | null;
};
