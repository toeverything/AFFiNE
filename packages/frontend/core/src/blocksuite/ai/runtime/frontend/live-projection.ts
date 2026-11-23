import { DocModeProvider } from '@blocksuite/affine/shared/services';
import type { EditorHost } from '@blocksuite/affine/std';
import {
  GfxControllerIdentifier,
  type GfxModel,
  isPrimitiveModel,
} from '@blocksuite/affine/std/gfx';
import type { BlockModel } from '@blocksuite/affine/store';
import { Bound } from '@blocksuite/global/gfx';

import {
  getSelectedModels,
  getSelectedTextContent,
} from '../../utils/selection-utils';

const textLimit = (value: string, limit: number) => ({
  content: value.slice(0, limit),
  truncated: value.length > limit,
});

const MAX_LOCATOR_IDS = 50;
const MAX_RELATION_IDS = 200;

function boundedInteger(value: unknown, fallback: number, maximum: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? Math.min(value, maximum)
    : fallback;
}

function boundsOf(element: GfxModel) {
  const bounds = Bound.deserialize(element.xywh);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.w,
    height: bounds.h,
  };
}

function elementType(element: GfxModel) {
  const type = isPrimitiveModel(element) ? element.type : element.flavour;
  return type.startsWith('affine:') ? type.slice('affine:'.length) : type;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function elementProperties(element: GfxModel) {
  const serialized =
    record(isPrimitiveModel(element) ? element.serialize() : element.props) ??
    {};
  return {
    ...serialized,
    ...record(serialized.props),
  };
}

function textValue(value: unknown) {
  if (typeof value === 'string') return value;
  const object = record(value);
  if (!object || typeof object.toString !== 'function') return undefined;
  const text = object.toString();
  return text === '[object Object]' ? undefined : text;
}

function relations(element: GfxModel, props: Record<string, unknown>) {
  const pickIds = (key: string) => {
    const value = props[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    const entries = record(value);
    return entries
      ? Object.entries(entries)
          .filter(([, included]) => included !== false && included != null)
          .map(([id]) => id)
      : undefined;
  };
  const source = record(props.source);
  const target = record(props.target);
  const group = element.group;
  const frame = element.groups.find(
    candidate => 'flavour' in candidate && candidate.flavour === 'affine:frame'
  );
  const serializedGroup = group
    ? record(isPrimitiveModel(group) ? group.serialize() : group.props)
    : undefined;
  const groupProps = serializedGroup
    ? {
        ...serializedGroup,
        ...record(serializedGroup.props),
      }
    : undefined;
  const groupDetail = record(record(groupProps?.children)?.[element.id]);
  const childIds = (
    pickIds('childElementIds') ??
    pickIds('children') ??
    []
  ).sort();
  return {
    frame_id: frame?.id,
    child_ids: childIds.slice(0, MAX_RELATION_IDS),
    child_ids_truncated: childIds.length > MAX_RELATION_IDS,
    source_id: typeof source?.id === 'string' ? source.id : undefined,
    target_id: typeof target?.id === 'string' ? target.id : undefined,
    parent_id:
      typeof groupDetail?.parent === 'string'
        ? groupDetail.parent
        : group && group !== frame
          ? group.id
          : undefined,
    index:
      typeof groupDetail?.index === 'string' ? groupDetail.index : undefined,
  };
}

function projectElement(element: GfxModel, limit: number) {
  const props = elementProperties(element);
  const text = textValue(props.text) ?? textValue(props.label);
  const title = textValue(props.title);
  const pointCount = Array.isArray(props.points)
    ? props.points.length
    : props.pointCount;
  return {
    id: element.id,
    type: elementType(element),
    bounds: boundsOf(element),
    text: text ? textLimit(text, limit) : undefined,
    title: title ? textLimit(title, limit) : undefined,
    point_count:
      typeof pointCount === 'number' && Number.isInteger(pointCount)
        ? pointCount
        : undefined,
    ...relations(element, props),
  };
}

function projectBlock(model: BlockModel, limit: number) {
  const text = model.text?.toString() ?? '';
  return {
    id: model.id,
    flavour: model.flavour,
    text: textLimit(text, limit),
    child_ids: model.children.slice(0, MAX_RELATION_IDS).map(child => child.id),
    child_ids_truncated: model.children.length > MAX_RELATION_IDS,
  };
}

function neighborhoodOf(models: BlockModel[], distance: number) {
  const neighborhood = new Map<string, BlockModel>();
  for (const model of models) {
    const siblings = model.parent?.children ?? [];
    const index = siblings.indexOf(model);
    for (
      let cursor = Math.max(0, index - distance);
      cursor <= Math.min(siblings.length - 1, index + distance);
      cursor++
    ) {
      const sibling = siblings[cursor];
      if (sibling) neighborhood.set(sibling.id, sibling);
    }
  }
  return [...neighborhood.values()];
}

export function getLiveEditorMode(host: EditorHost) {
  return host.std.get(DocModeProvider).getEditorMode() || 'page';
}

export function getLiveSelectionIds(host: EditorHost) {
  if (getLiveEditorMode(host) === 'edgeless') {
    return host.std
      .get(GfxControllerIdentifier)
      .selection.selectedElements.map(element => element.id);
  }
  return (getSelectedModels(host) ?? []).map(model => model.id);
}

export function readEditorState(host: EditorHost, editorStateId: string) {
  const mode = getLiveEditorMode(host);
  const selectionIds = getLiveSelectionIds(host);
  return {
    editor_state_id: editorStateId,
    mode,
    readonly: host.store.readonly$.value,
    selection: {
      kind: mode === 'edgeless' ? 'elements' : 'blocks',
      ids: selectionIds.slice(0, MAX_LOCATOR_IDS),
      truncated: selectionIds.length > MAX_LOCATOR_IDS,
    },
    capabilities: [
      'frontend_get_editor_state',
      'frontend_read_selection',
      'frontend_read_nodes',
      'frontend_snapshot_document',
    ],
  };
}

export function lightEditorContext(host: EditorHost, editorStateId: string) {
  const state = readEditorState(host, editorStateId);
  if (state.mode === 'edgeless') {
    const preview = host.std
      .get(GfxControllerIdentifier)
      .selection.selectedElements.slice(0, 3)
      .map(element => {
        const projected = projectElement(element, 200);
        return {
          id: projected.id,
          type: projected.type,
          text: projected.text,
          title: projected.title,
        };
      });
    return { ...state, preview };
  }
  const preview = (getSelectedModels(host) ?? []).slice(0, 3).map(model => ({
    id: model.id,
    type: model.flavour,
    text: textLimit(model.text?.toString() ?? '', 200),
  }));
  return { ...state, preview };
}

export async function readSelection(
  host: EditorHost,
  editorStateId: string,
  args: Record<string, unknown>
) {
  const limit = boundedInteger(args.limit, 10_000, 50_000);
  const mode = getLiveEditorMode(host);
  if (mode === 'edgeless') {
    const selectedElements = host.std.get(GfxControllerIdentifier).selection
      .selectedElements;
    const elements = selectedElements
      .slice(0, MAX_LOCATOR_IDS)
      .map(element => projectElement(element, limit));
    return {
      editor_state_id: editorStateId,
      mode,
      elements,
      truncated: selectedElements.length > MAX_LOCATOR_IDS,
    };
  }
  const models = getSelectedModels(host) ?? [];
  const neighborhood = boundedInteger(args.neighborhood, 0, 20);
  if (args.format === 'structure') {
    const blocks = models.slice(0, 50);
    const nearby = neighborhoodOf(models, neighborhood).slice(0, 100);
    return {
      editor_state_id: editorStateId,
      mode,
      blocks: blocks.map(model => projectBlock(model, limit)),
      neighborhood: nearby.map(model =>
        projectBlock(model, Math.min(limit, 500))
      ),
      truncated: blocks.length < models.length,
    };
  }
  const format = args.format === 'text' ? 'plain-text' : 'markdown';
  const content = await getSelectedTextContent(host, format);
  return {
    editor_state_id: editorStateId,
    mode,
    ...textLimit(content, limit),
    block_ids: models.slice(0, MAX_LOCATOR_IDS).map(model => model.id),
    block_ids_truncated: models.length > MAX_LOCATOR_IDS,
    neighborhood: neighborhoodOf(models, neighborhood)
      .slice(0, 100)
      .map(model => projectBlock(model, Math.min(limit, 500))),
  };
}

export function readNodes(
  host: EditorHost,
  editorStateId: string,
  args: Record<string, unknown>
) {
  const limit = boundedInteger(args.limit, 10_000, 50_000);
  const blockIds = Array.isArray(args.block_ids)
    ? args.block_ids
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 50)
    : [];
  const elementIds = Array.isArray(args.element_ids)
    ? args.element_ids
        .filter((id): id is string => typeof id === 'string')
        .slice(0, 50)
    : [];
  const gfx = host.std.get(GfxControllerIdentifier);
  return {
    editor_state_id: editorStateId,
    items: [
      ...blockIds.map(id => {
        const block = host.store.getBlock(id)?.model;
        return block
          ? { id, kind: 'block', value: projectBlock(block, limit) }
          : { id, kind: 'block', error: { code: 'NODE_NOT_FOUND' } };
      }),
      ...elementIds.map(id => {
        const element = gfx.getElementById<GfxModel>(id);
        return element
          ? { id, kind: 'element', value: projectElement(element, limit) }
          : { id, kind: 'element', error: { code: 'NODE_NOT_FOUND' } };
      }),
    ],
  };
}

export function snapshotDocument(
  host: EditorHost,
  editorStateId: string,
  args: Record<string, unknown>
) {
  const limit = boundedInteger(args.limit, 50, 200);
  const mode = getLiveEditorMode(host);
  if (mode === 'edgeless') {
    const gfx = host.std.get(GfxControllerIdentifier);
    const bounds = gfx.viewport.viewportBounds;
    const visible = gfx.gfxElements.filter(element =>
      bounds.isIntersectWithBound(element.elementBound)
    );
    const elements = visible
      .slice(0, limit)
      .map(element => projectElement(element, 500));
    return {
      editor_state_id: editorStateId,
      mode,
      viewport: {
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.w,
          height: bounds.h,
        },
        elements,
      },
      truncated: visible.length > limit,
    };
  }
  if (args.view === 'selection_neighborhood') {
    const selected = getSelectedModels(host) ?? [];
    const neighborhood = neighborhoodOf(selected, 2);
    const blocks = neighborhood.slice(0, limit);
    return {
      editor_state_id: editorStateId,
      mode,
      selection_neighborhood: blocks.map(model => projectBlock(model, 500)),
      truncated: neighborhood.length > limit,
    };
  }
  const outline = host.store
    .getBlocksByFlavour('affine:note')
    .flatMap(note => note.model.children);
  const blocks = outline.slice(0, limit).map(model => projectBlock(model, 500));
  return {
    editor_state_id: editorStateId,
    mode,
    outline: blocks,
    truncated: outline.length > limit,
  };
}
