import type { Constructor } from '@blocksuite/global/utils';
import type { GfxCompatibleProps } from '@blocksuite/std/gfx';
import { GfxCompatible } from '@blocksuite/std/gfx';
import {
  type BaseBlockTransformer,
  type BlockModel,
  defineBlockSchema,
  type InternalPrimitives,
} from '@blocksuite/store';

import type { BlockMeta } from './types';

export type EmbedProps<Props = object> = Props &
  GfxCompatibleProps &
  BlockMeta & {
    comments?: Record<string, boolean>;
  };

export function defineEmbedModel<
  Props extends object,
  T extends Constructor<BlockModel<Props>> = Constructor<BlockModel<Props>>,
>(BlockModelSuperClass: T) {
  return GfxCompatible<EmbedProps<Props>>(
    BlockModelSuperClass as Constructor<BlockModel<EmbedProps<Props>>>
  );
}

export type EmbedBlockModel<Props = object> = BlockModel<EmbedProps<Props>>;

export function createEmbedBlockSchema<
  Props extends object,
  Model extends EmbedBlockModel<Props>,
  Transformer extends BaseBlockTransformer<EmbedProps<Props>> =
    BaseBlockTransformer<EmbedProps<Props>>,
>({
  name,
  version,
  toModel,
  props,
  transformer,
}: {
  name: string;
  version: number;
  toModel: () => Model;
  props?: (internalPrimitives: InternalPrimitives) => Props;
  transformer?: () => Transformer;
}) {
  return defineBlockSchema({
    flavour: `affine:embed-${name}`,
    props: internalPrimitives => {
      const userProps = props?.(internalPrimitives);

      return {
        index: 'a0',
        xywh: '[0,0,0,0]',
        lockedBySelf: false,
        rotate: 0,
        comments: undefined,
        'meta:createdAt': undefined,
        'meta:updatedAt': undefined,
        'meta:createdBy': undefined,
        'meta:updatedBy': undefined,
        ...userProps,
      } as unknown as EmbedProps<Props>;
    },
    metadata: {
      version,
      role: 'content',
    },
    toModel,
    transformer,
  });
}
