import { BlockModel } from '../model/block/block-model';
import { type DraftModel, toDraftModel } from '../model/block/draft';
import {
  type InternalPrimitives,
  internalPrimitives,
} from '../model/block/zod';
import type { AssetsManager } from './assets';
import { fromJSON, toJSON } from './json';
import type { BlockSnapshot } from './type';

export type BlockSnapshotLeaf = Pick<
  BlockSnapshot,
  'id' | 'flavour' | 'props' | 'version'
>;

export type FromSnapshotPayload = {
  json: BlockSnapshotLeaf;
  assets: AssetsManager;
  children: BlockSnapshot[];
};

export type ToSnapshotPayload<Props extends object> = {
  model: DraftModel<BlockModel<Props>> | BlockModel<Props>;
  assets: AssetsManager;
};

export type SnapshotNode<Props extends object> = {
  id: string;
  flavour: string;
  version: number;
  props: Props;
};

export class BaseBlockTransformer<Props extends object = object> {
  protected _internal: InternalPrimitives = internalPrimitives;

  protected _propsFromSnapshot(propsJson: Record<string, unknown>) {
    return Object.fromEntries(
      Object.entries(propsJson).map(([key, value]) => {
        return [key, fromJSON(value)];
      })
    ) as Props;
  }

  protected _propsToSnapshot(model: DraftModel | BlockModel) {
    let draftModel: DraftModel;
    if (model instanceof BlockModel) {
      draftModel = toDraftModel(model);
    } else {
      draftModel = model;
    }
    return Object.fromEntries(
      draftModel.keys.map(key => {
        const value = draftModel.props[key as keyof typeof draftModel.props];
        return [key, toJSON(value)];
      })
    );
  }

  constructor(public readonly transformerConfigs: Map<string, unknown>) {}

  fromSnapshot({
    json,
  }: FromSnapshotPayload): Promise<SnapshotNode<Props>> | SnapshotNode<Props> {
    const { flavour, id, version, props: _props } = json;

    const props = this._propsFromSnapshot(_props);

    return {
      id,
      flavour,
      version: version ?? -1,
      props,
    };
  }

  toSnapshot({ model }: ToSnapshotPayload<Props>): BlockSnapshotLeaf {
    const { id, flavour, version } = model;

    const props = this._propsToSnapshot(model);

    return {
      id,
      flavour,
      version,
      props,
    };
  }
}
