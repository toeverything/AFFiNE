/* eslint-disable @typescript-eslint/ban-types */
import type { DocMode } from '@blocksuite/affine/blocks';
import type { WorkspaceMetadata } from '@toeverything/infra';

export type GLOBAL_DIALOG_SCHEMA = {
  'create-workspace': () => {
    metadata: WorkspaceMetadata;
    defaultDocId?: string;
  };
  'import-workspace': () => {
    workspace: WorkspaceMetadata;
  };
  'import-template': (props: {
    templateName: string;
    templateMode: DocMode;
    snapshotUrl: string;
  }) => void;
};

export type WORKSPACE_DIALOG_SCHEMA = {
  'doc-info': (props: { docId: string }) => void;
  'doc-selector': (props: { selectedDocIds: string[] }) => string[];
  'collection-selector': (props: {
    selectedCollectionIds: string[];
  }) => string[];
  'collection-editor': (props: {
    collectionId: string;
    mode?: 'page' | 'rule';
  }) => void;
};
