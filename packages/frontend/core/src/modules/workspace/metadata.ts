export type WorkspaceMetadata = {
  id: string;
  flavour: string;
  initialized?: boolean;
};

export const workspaceMetadataKey = (metadata: WorkspaceMetadata) =>
  `${metadata.flavour}:${metadata.id}`;
