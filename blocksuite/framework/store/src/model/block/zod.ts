import type * as Y from 'yjs';
import { z } from 'zod';

import { Boxed, Text } from '../../reactive/index.js';
import type { BaseBlockTransformer } from '../../transformer/base.js';
import type { BlockModel } from './block-model.js';

const FlavourSchema = z.string();
const ParentSchema = z.array(z.string()).optional();
const ContentSchema = z.array(z.string()).optional();
const RoleSchema = z.string();

export type RoleType = 'root' | 'content' | string;

export interface InternalPrimitives {
  Text: (input?: Y.Text | string) => Text;
  Boxed: <T>(input: T) => Boxed<T>;
}

export const internalPrimitives: InternalPrimitives = Object.freeze({
  Text: (input: Y.Text | string = '') => new Text(input),
  Boxed: <T>(input: T) => new Boxed(input),
});

export const BlockSchema = z.object({
  version: z.number(),
  model: z.object({
    role: RoleSchema,
    flavour: FlavourSchema,
    parent: ParentSchema,
    children: ContentSchema,
    isFlatData: z.boolean().optional(),
    props: z
      .function()
      .args(z.custom<InternalPrimitives>())
      .returns(z.record(z.any()))
      .optional(),
    toModel: z.function().args().returns(z.custom<BlockModel>()).optional(),
  }),
  transformer: z
    .function()
    .args(z.custom<Map<string, unknown>>())
    .returns(z.custom<BaseBlockTransformer>())
    .optional(),
});

export type BlockSchemaType = z.infer<typeof BlockSchema>;

export type PropsGetter<Props> = (
  internalPrimitives: InternalPrimitives
) => Props;

export function defineBlockSchema<
  Flavour extends string,
  Role extends RoleType,
  Props extends object,
  Metadata extends Readonly<{
    version: number;
    role: Role;
    parent?: string[];
    children?: string[];
    isFlatData?: boolean;
  }>,
  Model extends BlockModel<Props>,
  Transformer extends BaseBlockTransformer<Props>,
>(options: {
  flavour: Flavour;
  metadata: Metadata;
  props?: (internalPrimitives: InternalPrimitives) => Props;
  toModel?: () => Model;
  transformer?: (transformerConfig: Map<string, unknown>) => Transformer;
}): {
  version: number;
  model: {
    props: PropsGetter<Props>;
    flavour: Flavour;
  } & Metadata;
  transformer?: (transformerConfig: Map<string, unknown>) => Transformer;
};

export function defineBlockSchema({
  flavour,
  props,
  metadata,
  toModel,
  transformer,
}: {
  flavour: string;
  metadata: {
    version: number;
    role: RoleType;
    parent?: string[];
    children?: string[];
    isFlatData?: boolean;
  };
  props?: (internalPrimitives: InternalPrimitives) => Record<string, unknown>;
  toModel?: () => BlockModel;
  transformer?: (
    transformerConfig: Map<string, unknown>
  ) => BaseBlockTransformer;
}): BlockSchemaType {
  const schema = {
    version: metadata.version,
    model: {
      role: metadata.role,
      parent: metadata.parent,
      children: metadata.children,
      flavour,
      props,
      toModel,
      isFlatData: metadata.isFlatData,
    },
    transformer,
  } satisfies z.infer<typeof BlockSchema>;
  BlockSchema.parse(schema);
  return schema;
}
