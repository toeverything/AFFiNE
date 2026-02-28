import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { describe, expect, test, vi } from 'vitest';

import { effects } from '../../effects.js';
import type { TestShapeElement } from '../test-gfx-element.js';
import {
  RootBlockSchemaExtension,
  type SurfaceBlockModel,
  SurfaceBlockSchemaExtension,
} from '../test-schema.js';

effects();

const extensions = [RootBlockSchemaExtension, SurfaceBlockSchemaExtension];

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

const commonSetup = () => {
  const collection = new TestWorkspace(createTestOptions());

  collection.meta.initialize();
  const doc = collection.createDoc('home');
  const store = doc.getStore({ extensions });
  doc.load();

  const rootId = store.addBlock('test:page');
  const surfaceId = store.addBlock('test:surface', {}, rootId);

  const surfaceBlock = store.getBlock(surfaceId)!;

  return {
    surfaceId,
    surfaceModel: surfaceBlock.model as SurfaceBlockModel,
  };
};

describe('surface basic', () => {
  test('addElement should work correctly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });

    expect(model.elementModels[0].id).toBe(id);
  });

  test('removeElement should work correctly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });

    model.deleteElement(id);

    expect(model.elementModels.length).toBe(0);
  });

  test('updateElement should work correctly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });

    model.updateElement(id, { xywh: '[10,10,200,200]' });

    expect(model.elementModels[0].xywh).toBe('[10,10,200,200]');
  });

  test('getElementById should return element', () => {
    const { surfaceModel: model } = commonSetup();

    const id = model.addElement({
      type: 'testShape',
    });

    expect(model.getElementById(id)).not.toBeNull();
  });

  test('getElementById should return null if not found', () => {
    const { surfaceModel: model } = commonSetup();

    expect(model.getElementById('not-found')).toBeNull();
  });

  test('created observer should be called', () => {
    const { surfaceModel } = commonSetup();

    let expectPayload;
    const elementAddedCallback = vi.fn(payload => (expectPayload = payload));

    surfaceModel.elementAdded.subscribe(elementAddedCallback);

    const shapeId = surfaceModel.addElement({
      type: 'testShape',
      rotate: 0,
      xywh: '[0, 0, 10, 10]',
    });

    expect(elementAddedCallback).toHaveBeenCalled();
    expect(expectPayload).toMatchObject({
      id: shapeId,
    });
  });

  test('update and props observer should be called', () => {
    const { surfaceModel } = commonSetup();

    const shapeId = surfaceModel.addElement({
      type: 'testShape',
      rotate: 0,
      xywh: '[0, 0, 10, 10]',
    });
    const shapeModel = surfaceModel.getElementById(shapeId)!;

    let expectPayload;
    const elementUpdatedCallback = vi.fn(payload => (expectPayload = payload));
    let propsUpdatedPayload;
    const propsUpdatedCallback = vi.fn(payload => {
      propsUpdatedPayload = payload;
    });

    surfaceModel.elementUpdated.subscribe(elementUpdatedCallback);
    shapeModel.propsUpdated.subscribe(propsUpdatedCallback);

    surfaceModel.updateElement(shapeId, {
      rotate: 10,
    });

    expect(elementUpdatedCallback).toHaveBeenCalled();
    expect(propsUpdatedCallback).toHaveBeenCalled();
    expect(expectPayload).toMatchObject({
      id: shapeId,
      props: {
        rotate: 10,
      },
      oldValues: {
        rotate: 0,
      },
    });
    expect(propsUpdatedPayload).toMatchObject({
      key: 'rotate',
    });
  });

  test('delete observer should be called', () => {
    const { surfaceModel } = commonSetup();

    const shapeId = surfaceModel.addElement({
      type: 'testShape',
      rotate: 0,
      xywh: '[0, 0, 10, 10]',
    });

    let expectPayload;
    const deletedCallback = vi.fn(payload => (expectPayload = payload));

    surfaceModel.elementRemoved.subscribe(deletedCallback);
    surfaceModel.deleteElement(shapeId);

    expect(deletedCallback).toHaveBeenCalled();
    expect(expectPayload).toMatchObject({
      id: shapeId,
      type: 'testShape',
    });
  });
});

describe('element model', () => {
  test('default value should work correctly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });

    const element = model.getElementById(id)! as TestShapeElement;

    expect(element.rotate).toBe(0);
    expect(element.xywh).toBe('[0,0,10,10]');
  });

  test('defined prop should not be overwritten by default value', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
      rotate: 20,
    });

    const element = model.getElementById(id)! as TestShapeElement;

    expect(element.rotate).toBe(20);
  });

  test('assign value to model property should update ymap directly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });

    const element = model.getElementById(id)! as TestShapeElement;

    expect(element.yMap.get('rotate')).toBe(0);
    element.rotate = 30;
    expect(element.yMap.get('rotate')).toBe(30);
  });
});

describe('stash/pop', () => {
  const { surfaceModel: model } = commonSetup();
  test('stash and pop should work correctly', () => {
    const id = model.addElement({
      type: 'testShape',
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    expect(elementModel.rotate).toBe(0);

    elementModel.stash('rotate');
    elementModel.rotate = 10;
    expect(elementModel.rotate).toBe(10);
    expect(elementModel.yMap.get('rotate')).toBe(0);

    elementModel.pop('rotate');
    expect(elementModel.rotate).toBe(10);
    expect(elementModel.yMap.get('rotate')).toBe(10);

    elementModel.rotate = 6;
    expect(elementModel.rotate).toBe(6);
    expect(elementModel.yMap.get('rotate')).toBe(6);
  });

  test('assign stashed property should emit event', () => {
    const id = model.addElement({
      type: 'testShape',
      rotate: 4,
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    elementModel.stash('rotate');

    const onchange = vi.fn();
    const subscription = model.elementUpdated.subscribe(({ id }) => {
      subscription.unsubscribe();
      onchange(id);
    });

    elementModel.rotate = 10;
    expect(onchange).toHaveBeenCalledWith(id);
  });

  test('stashed property should also trigger derive decorator', () => {
    const id = model.addElement({
      type: 'testShape',
      rotate: 20,
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    elementModel.stash('shapeType');
    elementModel.shapeType = 'triangle';

    // rotation should be 0 'cause of derive decorator
    expect(elementModel.rotate).toBe(0);
  });

  test('non-field property should not allow stash/pop, and should fail silently ', () => {
    const id = model.addElement({
      type: 'testShape',
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    // opacity is a local property, so it should not be stashed
    elementModel.stash('opacity');
    expect(elementModel['_stashed'].has('opacity')).toBe(false);

    // pop the `opacity` should not affect yMap
    elementModel.opacity = 0.5;
    elementModel.pop('opacity');
    expect(elementModel.yMap.has('opacity')).toBe(false);
  });
});

describe('derive decorator', () => {
  test('derived decorator should work correctly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
      rotate: 20,
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    elementModel.shapeType = 'triangle';

    expect(elementModel.rotate).toBe(0);
  });
});

describe('local decorator', () => {
  test('local decorator should work correctly', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    expect(elementModel.display).toBe(true);

    elementModel.display = false;
    expect(elementModel.display).toBe(false);

    elementModel.opacity = 0.5;
    expect(elementModel.opacity).toBe(0.5);
  });

  test('assign local property should emit event', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    const onchange = vi.fn();
    const subscription = model.elementUpdated.subscribe(({ id }) => {
      subscription.unsubscribe();
      onchange(id);
    });

    const onPropChange = vi.fn();
    elementModel.propsUpdated.subscribe(({ key }) => {
      onPropChange(key);
    });

    elementModel.display = false;

    expect(elementModel.display).toBe(false);
    expect(onchange).toHaveBeenCalledWith(id);
    expect(onPropChange).toHaveBeenCalledWith('display');
  });
});

describe('convert decorator', () => {
  test('convert decorator', () => {
    const { surfaceModel: model } = commonSetup();
    const id = model.addElement({
      type: 'testShape',
    });
    const elementModel = model.getElementById(id)! as TestShapeElement;

    // @ts-expect-error test needed
    elementModel.shapeType = 'otherImpossibleType';

    expect(elementModel.shapeType).toBe('rect');
  });
});
