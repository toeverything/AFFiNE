import { ImageBlockSchema } from '@blocksuite/affine-model';
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

export type Image = File[];

type ImageToSliceSnapshotPayload = {
  file: Image;
  assets?: AssetsManager;
  workspaceId: string;
  pageId: string;
};

export class ImageAdapter extends BaseAdapter<Image> {
  override fromBlockSnapshot(
    _payload: FromBlockSnapshotPayload
  ): Promise<FromBlockSnapshotResult<Image>> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'ImageAdapter.fromBlockSnapshot is not implemented.'
    );
  }

  override fromDocSnapshot(
    _payload: FromDocSnapshotPayload
  ): Promise<FromDocSnapshotResult<Image>> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'ImageAdapter.fromDocSnapshot is not implemented.'
    );
  }

  override fromSliceSnapshot(
    payload: FromSliceSnapshotPayload
  ): Promise<FromSliceSnapshotResult<Image>> {
    const images: Image = [];
    for (const contentSlice of payload.snapshot.content) {
      if (contentSlice.type === 'block') {
        const { flavour, props } = contentSlice;
        if (flavour === 'affine:image') {
          const { sourceId } = props;
          const file = payload.assets?.getAssets().get(sourceId as string) as
            | File
            | undefined;
          if (file) {
            images.push(file);
          }
        }
      }
    }
    return Promise.resolve({ file: images, assetsIds: [] });
  }

  override toBlockSnapshot(
    _payload: ToBlockSnapshotPayload<Image>
  ): Promise<BlockSnapshot> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'ImageAdapter.toBlockSnapshot is not implemented.'
    );
  }

  override toDocSnapshot(
    _payload: ToDocSnapshotPayload<Image>
  ): Promise<DocSnapshot> {
    throw new BlockSuiteError(
      ErrorCode.TransformerNotImplementedError,
      'ImageAdapter.toDocSnapshot is not implemented'
    );
  }

  override async toSliceSnapshot({
    assets,
    file: files,
    pageId,
    workspaceId,
  }: ImageToSliceSnapshotPayload): Promise<SliceSnapshot | null> {
    if (files.length === 0) return null;

    const content: SliceSnapshot['content'] = [];
    const flavour = ImageBlockSchema.model.flavour;

    for (const blob of files) {
      const id = nanoid();
      const { size } = blob;

      assets?.uploadingAssetsMap.set(id, {
        blob,
        mapInto: sourceId => ({ sourceId }),
      });

      content.push({
        type: 'block',
        flavour,
        id,
        props: { size },
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

export const ImageAdapterFactoryIdentifier = AdapterFactoryIdentifier('Image');

export const ImageAdapterFactoryExtension: ExtensionType = {
  setup: di => {
    di.addImpl(ImageAdapterFactoryIdentifier, provider => ({
      get: (job: Transformer) => new ImageAdapter(job, provider),
    }));
  },
};
