import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  type GroupElementModel,
  MindmapElementModel,
} from '@blocksuite/affine-model';
import type { Command } from '@blocksuite/std';
import {
  GfxControllerIdentifier,
  type GfxGroupCompatibleInterface,
  type GfxModel,
} from '@blocksuite/std/gfx';

type BatchContainer = GfxGroupCompatibleInterface & {
  addChildren?: (elements: GfxModel[]) => void;
  removeChildren?: (elements: GfxModel[]) => void;
};

const addChildren = (
  container: GfxGroupCompatibleInterface,
  elements: GfxModel[]
) => {
  const batchContainer = container as BatchContainer;
  if (batchContainer.addChildren) {
    batchContainer.addChildren(elements);
    return;
  }

  elements.forEach(element => {
    container.addChild(element);
  });
};

const removeChildren = (
  container: GfxGroupCompatibleInterface,
  elements: GfxModel[]
) => {
  const batchContainer = container as BatchContainer;
  if (batchContainer.removeChildren) {
    batchContainer.removeChildren(elements);
    return;
  }

  elements.forEach(element => {
    container.removeChild(element);
  });
};

export const createGroupCommand: Command<
  { elements: GfxModel[] | string[] },
  { groupId: string }
> = (ctx, next) => {
  const { std, elements } = ctx;
  const gfx = std.get(GfxControllerIdentifier);
  const crud = std.get(EdgelessCRUDIdentifier);

  const groups = gfx.layer.canvasElements.filter(
    el => el.type === 'group'
  ) as GroupElementModel[];
  const groupId = crud.addElement('group', {
    children: elements.reduce(
      (pre, el) => {
        const id = typeof el === 'string' ? el : el.id;
        pre[id] = true;
        return pre;
      },
      {} as Record<string, true>
    ),
    title: `Group ${groups.length + 1}`,
  });
  if (!groupId) {
    return;
  }

  next({ groupId });
};

export const createGroupFromSelectedCommand: Command<
  {},
  { groupId: string }
> = (ctx, next) => {
  const { std } = ctx;
  const gfx = std.get(GfxControllerIdentifier);
  const { selection, surface } = gfx;

  if (!surface) {
    return;
  }

  if (
    selection.selectedElements.length === 0 ||
    !selection.selectedElements.every(
      element =>
        element.group === selection.firstElement.group &&
        !(element.group instanceof MindmapElementModel)
    )
  ) {
    return;
  }

  const parent = selection.firstElement.group;

  if (parent !== null) {
    removeChildren(parent, selection.selectedElements);
  }

  const [_, result] = std.command.exec(createGroupCommand, {
    elements: selection.selectedElements,
  });
  if (!result.groupId) {
    return;
  }
  const group = surface.getElementById(result.groupId);

  if (parent !== null && group) {
    parent.addChild(group);
  }

  selection.set({
    editing: false,
    elements: [result.groupId],
  });

  next({ groupId: result.groupId });
};

export const ungroupCommand: Command<{ group: GroupElementModel }, {}> = (
  ctx,
  next
) => {
  const { std, group } = ctx;
  const gfx = std.get(GfxControllerIdentifier);
  const { selection } = gfx;
  const parent = group.group;
  const elements = [...group.childElements];

  if (group instanceof MindmapElementModel) {
    return;
  }

  const orderedElements = [...elements].sort((a, b) => gfx.layer.compare(a, b));

  std.store.transact(() => {
    if (parent !== null) {
      removeChildren(parent, [group]);
    }

    removeChildren(group, elements);

    // keep relative index order of group children after ungroup
    orderedElements.forEach(element => {
      element.index = gfx.layer.generateIndex();
    });

    if (parent !== null) {
      addChildren(parent, orderedElements);
    }
  });

  selection.set({
    editing: false,
    elements: orderedElements.map(ele => ele.id),
  });
  next();
};
