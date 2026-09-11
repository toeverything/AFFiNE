import {
  BaseBlockTransformer,
  type BlockSnapshotLeaf,
  Boxed,
  type FromSnapshotPayload,
  type SnapshotNode,
  type ToSnapshotPayload,
} from '@blocksuite/affine/store';

import { assetIdsFromProps, snapshotIdsFromProps } from '../../infra/blob-gc';
import { readSketchAssets } from './assets';
import type { SketchBlockProps } from './model';
import type { SketchAssets } from './types';

export const SKETCH_SCHEMA_VERSION = 1;

type SketchPropsMigration = (props: SketchBlockProps) => SketchBlockProps;

/**
 * `version` → step that upgrades props to `version + 1` (plan §8.3).
 * A schema bump registers its step here and raises
 * `SKETCH_SCHEMA_VERSION`; fields keep their meaning instead of being reused.
 */
const SKETCH_MIGRATIONS: Record<number, SketchPropsMigration> = {};

/** Props introduced after a snapshot was written come back as `undefined`. */
function withSketchDefaults(props: SketchBlockProps): SketchBlockProps {
  return {
    ...props,
    assets:
      props.assets instanceof Boxed
        ? props.assets
        : new Boxed<SketchAssets>({
            ...(props.assets as SketchAssets | undefined),
          }),
    revision: typeof props.revision === 'number' ? props.revision : 0,
  };
}

export function migrateSketchProps(
  props: SketchBlockProps,
  version: number
): SketchBlockProps {
  let migrated = withSketchDefaults(props);
  for (
    let step = Math.max(version, 0);
    step < SKETCH_SCHEMA_VERSION;
    step += 1
  ) {
    const migration = SKETCH_MIGRATIONS[step];
    if (migration) migrated = migration(migrated);
  }
  return migrated;
}

/** Scene, snapshot and embedded image blobs travel with the `.bs.zip`. */
function sketchBlobIds(props: {
  sceneBlobId?: string;
  snapshotSvgBlobId?: string;
  assets: SketchAssets;
}) {
  return [
    ...snapshotIdsFromProps({
      sceneBlobId: props.sceneBlobId,
      snapshotSvgBlobId: props.snapshotSvgBlobId,
    }),
    ...assetIdsFromProps({ assets: props.assets }),
  ];
}

/**
 * Raw snapshot props keep a `Boxed` as `{ value }`; the parsed prop cannot be
 * read before the block is attached to a document.
 */
function snapshotAssets(props: Record<string, unknown>): SketchAssets {
  const boxed = props['assets'] as { value?: unknown } | undefined;
  const value = boxed && 'value' in boxed ? boxed.value : boxed;
  return readSketchAssets(value as SketchAssets | undefined);
}

export class SketchBlockTransformer extends BaseBlockTransformer<SketchBlockProps> {
  override async fromSnapshot(
    payload: FromSnapshotPayload
  ): Promise<SnapshotNode<SketchBlockProps>> {
    const node = await super.fromSnapshot(payload);
    const assets = payload.assets.getAssets();
    const blobIds = sketchBlobIds({
      sceneBlobId: node.props.sceneBlobId,
      snapshotSvgBlobId: node.props.snapshotSvgBlobId,
      assets: snapshotAssets(payload.json.props),
    });
    for (const blobId of blobIds) {
      if (assets.has(blobId)) await payload.assets.writeToBlob(blobId);
    }
    return {
      ...node,
      version: SKETCH_SCHEMA_VERSION,
      props: migrateSketchProps(node.props, node.version),
    };
  }

  override toSnapshot(
    payload: ToSnapshotPayload<SketchBlockProps>
  ): BlockSnapshotLeaf {
    const snapshot = super.toSnapshot(payload);
    const pathBlobIdMap = payload.assets.getPathBlobIdMap();
    const { props } = payload.model;
    const blobIds = sketchBlobIds({
      sceneBlobId: props.sceneBlobId,
      snapshotSvgBlobId: props.snapshotSvgBlobId,
      assets: readSketchAssets(props.assets),
    });
    for (const blobId of blobIds) {
      pathBlobIdMap.set(`${payload.model.id}/${blobId}`, blobId);
    }
    return snapshot;
  }
}
