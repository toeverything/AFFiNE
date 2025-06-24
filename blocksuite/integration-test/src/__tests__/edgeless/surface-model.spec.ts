import type { SurfaceBlockModel } from '@blocksuite/affine/blocks/surface';
import type {
  BrushElementModel,
  ConnectorElementModel,
  GroupElementModel,
} from '@blocksuite/affine/model';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { setupEditor } from '../utils/setup.js';

let model: SurfaceBlockModel;

beforeEach(async () => {
  const cleanup = await setupEditor('edgeless');
  const models = doc.getModelsByFlavour(
    'affine:surface'
  ) as SurfaceBlockModel[];

  model = models[0];

  return cleanup;
});

describe('group', () => {
  test('empty group should have all zero xywh', () => {
    const id = model.addElement({
      type: 'group',
    });
    const group = model.getElementById(id)! as GroupElementModel;

    expect(group.x).toBe(0);
    expect(group.y).toBe(0);
    expect(group.w).toBe(0);
    expect(group.h).toBe(0);
  });

  test('should get group', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });

    const groupId = model.addElement({
      type: 'group',
      children: {
        [id]: true,
        [id2]: true,
      },
    });
    const group = model.getElementById(groupId);
    const shape = model.getElementById(id)!;
    const shape2 = model.getElementById(id2)!;

    expect(group).not.toBe(null);
    expect(model.getGroup(id)).toBe(group);
    expect(model.getGroup(id2)).toBe(group);
    expect(shape.group).toBe(group);
    expect(shape2.group).toBe(group);
  });

  test('should return null if children property is updated', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });
    const id3 = model.addElement({
      type: 'shape',
    });

    const groupId = model.addElement({
      type: 'group',
      children: {
        [id]: true,
        [id2]: true,
        [id3]: true,
      },
    });
    const group = model.getElementById(groupId) as GroupElementModel;

    model.store.transact(() => {
      group.children.delete(id);
      group.children.delete(id2);
    });

    expect(model.getElementById(groupId)).toBe(group);
    expect(model.getGroup(id)).toBeNull();
    expect(model.getGroup(id2)).toBeNull();
  });

  test('should return null if group are deleted', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });

    const groupId = model.addElement({
      type: 'group',
      children: {
        [id]: true,
        [id2]: true,
      },
    });

    model.deleteElement(groupId);
    expect(model.getGroup(id)).toBeNull();
    expect(model.getGroup(id2)).toBeNull();
  });

  test('children can be updated with a plain object', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });

    const groupId = model.addElement({
      type: 'group',
      children: {
        [id]: true,
        [id2]: true,
      },
    });
    const group = model.getElementById(groupId) as GroupElementModel;

    model.updateElement(groupId, {
      children: {
        [id]: false,
      },
    });

    expect(group.childIds).toEqual([id]);
  });
});

describe('connector', () => {
  test('should get connector', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });
    const connectorId = model.addElement({
      type: 'connector',
      source: {
        id,
      },
      target: {
        id: id2,
      },
    });
    const connector = model.getElementById(connectorId)!;

    expect(model.getConnectors(id).map(el => el.id)).toEqual([connector.id]);
    expect(model.getConnectors(id2).map(el => el.id)).toEqual([connector.id]);
    expect((connector as ConnectorElementModel).forceFullRender).toBe(true);
  });

  test('multiple connectors are supported', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });
    const connectorId = model.addElement({
      type: 'connector',
      source: {
        id,
      },
      target: {
        id: id2,
      },
    });
    const connectorId2 = model.addElement({
      type: 'connector',
      source: {
        id,
      },
      target: {
        id: id2,
      },
    });

    const connector = model.getElementById(connectorId)!;
    const connector2 = model.getElementById(connectorId2)!;
    const connectors = [connector.id, connector2.id];

    expect(model.getConnectors(id).map(c => c.id)).toEqual(connectors);
    expect(model.getConnectors(id2).map(c => c.id)).toEqual(connectors);
    expect((connector as ConnectorElementModel).forceFullRender).toBe(true);
    expect((connector2 as ConnectorElementModel).forceFullRender).toBe(true);
  });

  test('should return null if connector are updated', () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });
    const connectorId = model.addElement({
      type: 'connector',
      source: {
        id,
      },
      target: {
        id: id2,
      },
    });

    const connectorBeforeUpdate = model.getElementById(connectorId)!;
    expect(
      (connectorBeforeUpdate as ConnectorElementModel).forceFullRender
    ).toBe(true);

    model.updateElement(connectorId, {
      source: {
        position: [0, 0],
      },
      target: {
        position: [0, 0],
      },
    });

    expect(model.getConnectors(id)).toEqual([]);
    expect(model.getConnectors(id2)).toEqual([]);
  });

  test('should return null if connector are deleted', async () => {
    const id = model.addElement({
      type: 'shape',
    });
    const id2 = model.addElement({
      type: 'shape',
    });
    const connectorId = model.addElement({
      type: 'connector',
      source: {
        id,
      },
      target: {
        id: id2,
      },
    });

    const connectorBeforeDelete = model.getElementById(connectorId)!;
    expect(
      (connectorBeforeDelete as ConnectorElementModel).forceFullRender
    ).toBe(true);

    model.deleteElement(connectorId);

    await wait();

    expect(model.getConnectors(id)).toEqual([]);
    expect(model.getConnectors(id2)).toEqual([]);
  });
});

describe('brush', () => {
  test('same lineWidth should have same xywh', () => {
    const id = model.addElement({
      type: 'brush',
      lineWidth: 2,
      points: [
        [0, 0],
        [100, 100],
        [120, 150],
      ],
    });
    const brush = model.getElementById(id) as BrushElementModel;
    const oldBrushXYWH = brush.xywh;

    brush.lineWidth = 4;

    expect(brush.xywh).not.toBe(oldBrushXYWH);

    brush.lineWidth = 2;

    expect(brush.xywh).toBe(oldBrushXYWH);
  });
});
