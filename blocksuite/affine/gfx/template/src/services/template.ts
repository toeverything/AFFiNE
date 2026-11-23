import {
  getSurfaceBlock,
  type SurfaceBlockModel,
  type SurfaceBlockTransformer,
} from '@blocksuite/affine-block-surface';
import type { ConnectorElementModel } from '@blocksuite/affine-model';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import { Bound, getCommonBound } from '@blocksuite/global/gfx';
import { assertType } from '@blocksuite/global/utils';
import type { BlockStdScope } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import {
  type BlockModel,
  type BlockSnapshot,
  type DocSnapshot,
  DocSnapshotSchema,
  type SnapshotNode,
  type Transformer,
} from '@blocksuite/store';
import { Subject } from 'rxjs';
import type * as Y from 'yjs';

import {
  createInsertPlaceMiddleware,
  createRegenerateIndexMiddleware,
  createStickerMiddleware,
  replaceIdMiddleware,
} from './template-middlewares';
/**
 * Those block contains other block's id
 * should defer the loading
 */
const DEFERED_BLOCK = [
  'affine:surface',
  'affine:surface-ref',
  'affine:frame',
] as const;

/**
 * Those block should not be inserted directly
 * it should be merged with current existing block
 */
const MERGE_BLOCK = ['affine:surface', 'affine:page'] as const;

type MergeBlockFlavour = (typeof MERGE_BLOCK)[number];

/**
 * Template type will affect the inserting behaviour
 */
const TEMPLATE_TYPES = ['template', 'sticker'] as const;

type TemplateType = (typeof TEMPLATE_TYPES)[number];

export type SlotBlockPayload = {
  type: 'block';
  data: {
    blockJson: BlockSnapshot;
    parent?: string;
    index?: number;
  };
};

export type SlotPayload =
  | SlotBlockPayload
  | {
      type: 'template';
      template: DocSnapshot;
      bound: Bound | null;
    };

export type TemplateJobConfig = {
  model: SurfaceBlockModel;
  type: string;
  middlewares: ((job: TemplateJob) => void)[];
};

export class TemplateJob {
  static middlewares: ((job: TemplateJob) => void)[] = [];

  private _template: DocSnapshot | null = null;

  job: Transformer;

  model: SurfaceBlockModel;

  slots = {
    beforeInsert: new Subject<
      | SlotBlockPayload
      | {
          type: 'template';
          template: DocSnapshot;
          bound: Bound | null;
        }
    >(),
  };

  type: TemplateType;

  constructor({ model, type, middlewares }: TemplateJobConfig) {
    this.job = model.store.getTransformer();
    this.model = model;
    this.type = TEMPLATE_TYPES.includes(type as TemplateType)
      ? (type as TemplateType)
      : 'template';

    middlewares.forEach(middleware => middleware(this));
    TemplateJob.middlewares.forEach(middleware => middleware(this));
  }

  static create(options: {
    model: SurfaceBlockModel;
    type: string;
    middlewares: ((job: TemplateJob) => void)[];
  }) {
    return new TemplateJob(options);
  }

  private _getMergeBlockId(modelData: BlockSnapshot) {
    switch (modelData.flavour as MergeBlockFlavour) {
      case 'affine:page':
        return this.model.store.root!.id;
      case 'affine:surface':
        return this.model.id;
    }
  }

  private _getTemplateBound() {
    const bounds: Bound[] = [];

    this.walk(block => {
      if (block.props.xywh) {
        bounds.push(Bound.deserialize(block.props['xywh'] as string));
      }

      if (block.flavour === 'affine:surface') {
        const ignoreType = new Set(['connector', 'group']);

        Object.entries(
          block.props.elements as Record<string, Record<string, unknown>>
        ).forEach(([_, val]) => {
          const type = val['type'] as string;

          if (val['xywh'] && !ignoreType.has(type)) {
            bounds.push(Bound.deserialize(val['xywh'] as string));
          }

          if (type === 'connector') {
            (['target', 'source'] as const).forEach(prop => {
              const propVal = val[prop];
              assertType<ConnectorElementModel['source']>(propVal);

              if (propVal['id'] || !propVal['position']) return;

              const pos = propVal['position'];

              if (pos) {
                bounds.push(new Bound(pos[0], pos[1], 0, 0));
              }
            });
          }
        });
      }
    });

    return getCommonBound(bounds);
  }

  private _insertToDoc(
    modelDataList: {
      flavour: string;
      json: BlockSnapshot;
      modelData: SnapshotNode<object> | null;
      parent?: string;
      index?: number;
    }[]
  ) {
    const doc = this.model.store;
    const mergeIdMapping = new Map<string, string>();
    const deferInserting: typeof modelDataList = [];

    const insert = (
      data: (typeof modelDataList)[number],
      defered: boolean = true
    ) => {
      const { flavour, json, modelData, parent, index } = data;
      const isMergeBlock = MERGE_BLOCK.includes(flavour as MergeBlockFlavour);

      if (isMergeBlock) {
        mergeIdMapping.set(json.id, this._getMergeBlockId(json));
      }

      if (
        defered &&
        DEFERED_BLOCK.includes(flavour as (typeof DEFERED_BLOCK)[number])
      ) {
        deferInserting.push(data);
        return;
      } else {
        if (isMergeBlock) {
          this._mergeProps(
            json,
            this.model.store.getModelById(
              this._getMergeBlockId(json)
            ) as BlockModel
          );
          return;
        }

        if (!modelData) {
          return;
        }

        doc.addBlock(
          modelData.flavour,
          {
            ...modelData.props,
            id: modelData.id,
          },
          parent ? (mergeIdMapping.get(parent) ?? parent) : undefined,
          index
        );
      }
    };

    modelDataList.forEach(data => insert(data));
    deferInserting.forEach(data => insert(data, false));
  }

  private async _jsonToModelData(json: BlockSnapshot) {
    const job = this.job;
    const defered: {
      snapshot: BlockSnapshot;
      parent?: string;
      index?: number;
    }[] = [];
    const modelDataList: {
      flavour: string;
      json: BlockSnapshot;
      modelData: SnapshotNode<object> | null;
      parent?: string;
      index?: number;
    }[] = [];
    const toModel = async (
      snapshot: BlockSnapshot,
      parent?: string,
      index?: number,
      defer: boolean = true
    ) => {
      if (
        defer &&
        DEFERED_BLOCK.includes(
          snapshot.flavour as (typeof DEFERED_BLOCK)[number]
        )
      ) {
        defered.push({
          snapshot,
          parent,
          index,
        });
        return;
      }

      const slotData = {
        blockJson: snapshot,
        parent,
        index,
      };

      this.slots.beforeInsert.next({ type: 'block', data: slotData });

      /**
       * merge block should not be converted to model data
       */
      const modelData = MERGE_BLOCK.includes(
        snapshot.flavour as MergeBlockFlavour
      )
        ? null
        : ((await job.snapshotToModelData(snapshot)) ?? null);

      modelDataList.push({
        flavour: snapshot.flavour,
        json: snapshot,
        modelData,
        parent,
        index,
      });

      if (snapshot.children) {
        let index = 0;
        for (const child of snapshot.children) {
          await toModel(child, snapshot.id, index);
          ++index;
        }
      }
    };

    await toModel(json);

    for (const json of defered) {
      await toModel(json.snapshot, json.parent, json.index, false);
    }

    return modelDataList;
  }

  private _mergeProps(from: BlockSnapshot, to: BlockModel) {
    switch (from.flavour as MergeBlockFlavour) {
      case 'affine:page':
        break;
      case 'affine:surface':
        this._mergeSurfaceElements(
          from.props.elements as Record<string, Record<string, unknown>>,
          (to as SurfaceBlockModel).elements.getValue()!
        );
        break;
    }
  }

  private _mergeSurfaceElements(
    from: Record<string, Record<string, unknown>>,
    to: Y.Map<Y.Map<unknown>>
  ) {
    const schema = this.model.store.schema.get('affine:surface');
    const surfaceTransformer = schema?.transformer?.(
      new Map()
    ) as SurfaceBlockTransformer;

    this.model.store.transact(() => {
      const defered: [string, Record<string, unknown>][] = [];

      Object.entries(from).forEach(([id, val]) => {
        if (['connector', 'group'].includes(val.type as string)) {
          defered.push([id, val]);
        } else {
          to.set(id, surfaceTransformer.elementFromJSON(val));
        }
      });

      defered.forEach(([key, val]) => {
        to.set(key, surfaceTransformer.elementFromJSON(val));
      });
    });
  }

  async insertTemplate(template: unknown) {
    DocSnapshotSchema.parse(template);

    assertType<DocSnapshot>(template);

    this._template = template;

    const templateBound = this._getTemplateBound();

    this.slots.beforeInsert.next({
      type: 'template',
      template: template,
      bound: templateBound,
    });

    const modelDataList = await this._jsonToModelData(template.blocks);

    this._insertToDoc(modelDataList);

    return templateBound;
  }

  walk(callback: (block: BlockSnapshot, template: DocSnapshot) => void) {
    if (!this._template) {
      throw new Error('Template not loaded, please call insertTemplate first');
    }

    const iterate = (block: BlockSnapshot, template: DocSnapshot) => {
      callback(block, template);

      if (block.children) {
        block.children.forEach(child => iterate(child, template));
      }
    };

    iterate(this._template.blocks, this._template);
  }
}

export function createTemplateJob(
  std: BlockStdScope,
  type: 'template' | 'sticker',
  center?: { x: number; y: number }
) {
  const surface = getSurfaceBlock(std.store);
  if (!surface) {
    throw new BlockSuiteError(
      BlockSuiteError.ErrorCode.NoSurfaceModelError,
      'This doc is missing surface block in edgeless.'
    );
  }

  const gfx = std.get(GfxControllerIdentifier);
  const middlewares: ((job: TemplateJob) => void)[] = [];
  const { layer, viewport } = gfx;
  const blocks = layer.blocks;
  const elements = layer.canvasElements;

  if (type === 'template') {
    const bounds = [...blocks, ...elements].map(i => Bound.deserialize(i.xywh));
    const currentContentBound = getCommonBound(bounds);

    if (currentContentBound) {
      currentContentBound.x += currentContentBound.w + 20 / viewport.zoom;
      middlewares.push(createInsertPlaceMiddleware(currentContentBound));
    }

    const idxGenerator = layer.createIndexGenerator();

    middlewares.push(createRegenerateIndexMiddleware(() => idxGenerator()));
  }

  if (type === 'sticker') {
    middlewares.push(
      createStickerMiddleware(center || viewport.center, () =>
        layer.generateIndex()
      )
    );
  }

  middlewares.push(replaceIdMiddleware);

  return TemplateJob.create({
    model: surface,
    type,
    middlewares,
  });
}
