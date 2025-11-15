import { AttachmentBlockSchema } from '@blocksuite/affine-model';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import {
  type AssetsManager,
  BaseAdapter,
  type BlockSnapshot,
  type DocSnapshot,
  type ExtensionType,
  type FromBlockSnapshotPayload,
  type FromBlockSnapshotResult,
  type FromDocSnapshotPayload,
  type FromDocSnapshotResult,
  type FromSliceSnapshotPayload,
  type FromSliceSnapshotResult,
  nanoid,
  type SliceSnapshot,
  type ToBlockSnapshotPayload,
  type ToDocSnapshotPayload,
  type Transformer,
} from '@blocksuite/store';

import { AdapterFactoryIdentifier } from './types/adapter';

export type Attachment = File[];

type AttachmentToSliceSnapshotPayload = {
  file: Attachment;
  assets?: AssetsManager;
  workspaceId: string;
  pageId: string;
};

export class AttachmentAdapter extends BaseAdapter<Attachment> {
  override fromBlockSnapshot(
    _payload: FromBlockSnapshotPayload
  ): Promise<FromBlockSnapshotResult<Attachment>> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'AttachmentAdapter.fromBlockSnapshot is not implemented.'
    );
  }

  override fromDocSnapshot(
    _payload: FromDocSnapshotPayload
  ): Promise<FromDocSnapshotResult<Attachment>> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'AttachmentAdapter.fromDocSnapshot is not implemented.'
    );
  }

  override fromSliceSnapshot(
    payload: FromSliceSnapshotPayload
  ): Promise<FromSliceSnapshotResult<Attachment>> {
    const attachments: Attachment = [];
    for (const contentSlice of payload.snapshot.content) {
      if (contentSlice.type === 'block') {
        const { flavour, props } = contentSlice;
        if (flavour === 'affine:attachment') {
          const { sourceId } = props;
          const file = payload.assets?.getAssets().get(sourceId as string) as
            | File
            | undefined;
          if (file) {
            attachments.push(file);
          }
        }
      }
    }
    return Promise.resolve({ file: attachments, assetsIds: [] });
  }

  override toBlockSnapshot(
    _payload: ToBlockSnapshotPayload<Attachment>
  ): Promise<BlockSnapshot> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'AttachmentAdapter.toBlockSnapshot is not implemented.'
    );
  }

  override toDocSnapshot(
    _payload: ToDocSnapshotPayload<Attachment>
  ): Promise<DocSnapshot> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'AttachmentAdapter.toDocSnapshot is not implemented.'
    );
  }

  override async toSliceSnapshot({
    assets,
    file: files,
    pageId,
    workspaceId,
  }: AttachmentToSliceSnapshotPayload): Promise<SliceSnapshot | null> {
    if (files.length === 0) return null;

    const content: SliceSnapshot['content'] = [];
    const flavour = AttachmentBlockSchema.model.flavour;

    for (const blob of files) {
      const id = nanoid();
      const { name, size, type } = blob;

      assets?.uploadingAssetsMap.set(id, {
        blob,
        mapInto: sourceId => ({ sourceId }),
      });

      content.push({
        type: 'block',
        flavour,
        id,
        props: {
          name,
          size,
          type,
          embed: false,
          style: 'horizontalThin',
          index: 'a0',
          xywh: '[0,0,0,0]',
          rotate: 0,
        },
        children: [],
      });
    }

    return {
      type: 'slice',
      content,
      pageId,
      workspaceId,
    };
  }
}

export const AttachmentAdapterFactoryIdentifier =
  AdapterFactoryIdentifier('Attachment');

export const AttachmentAdapterFactoryExtension: ExtensionType = {
  setup: di => {
    di.addImpl(AttachmentAdapterFactoryIdentifier, provider => ({
      get: (job: Transformer) => new AttachmentAdapter(job, provider),
    }));
  },
};
