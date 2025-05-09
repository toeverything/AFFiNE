import {
  assertEdgelessConnectorToolMode,
  ConnectorMode,
  createConnectorElement,
  createShapeElement,
  deleteAllConnectors,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  redoByClick,
  setEdgelessTool,
  Shape,
  undoByClick,
} from '../../utils/actions/index.js';
import { assertConnectorPath } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test('elbow connector without node and width greater than height', async ({
  page,
}) => {
  await commonSetup(page);
  await setEdgelessTool(page, 'connector');
  await assertEdgelessConnectorToolMode(page, ConnectorMode.Curve);
  await dragBetweenViewCoords(page, [0, 0], [200, 100]);
  await assertConnectorPath(page, [
    [0, 0],
    [100, 0],
    [100, 100],
    [200, 100],
  ]);
});

test('elbow connector without node and width less than height', async ({
  page,
}) => {
  await commonSetup(page);
  await createConnectorElement(page, [0, 0], [100, 200]);
  await assertConnectorPath(page, [
    [0, 0],
    [0, 100],
    [100, 100],
    [100, 200],
  ]);
});

test('elbow connector one side attached element another side free', async ({
  page,
}) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createConnectorElement(page, [51, 50], [200, 0]);

  await assertConnectorPath(page, [
    [100, 50],
    [150, 50],
    [150, 0],
    [200, 0],
  ]);

  await deleteAllConnectors(page);
  await createConnectorElement(page, [50, 50], [125, 0]);

  await assertConnectorPath(page, [
    [50, 0],
    [125, 50],
    [125, 0],
  ]);
});

test('elbow connector both side attatched element', async ({ page }) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [50, 50], [249, 50]);

  await assertConnectorPath(page, [
    [50, 0],
    [200, 50],
  ]);

  // Could drag directly
  // because the default shape type change to general style with filled color
  await dragBetweenViewCoords(page, [250, 50], [250, 0]);
  await assertConnectorPath(page, [
    [50, 0],
    [150, 50],
    [150, 0],
    [200, 0],
  ]);

  await dragBetweenViewCoords(page, [250, 0], [150, -50]);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -50],
    [100, -50],
  ]);

  await dragBetweenViewCoords(page, [150, -50], [150, -150]);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -50],
    [150, -50],
    [150, -100],
  ]);

  await undoByClick(page);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -50],
    [100, -50],
  ]);
  await undoByClick(page);
  await assertConnectorPath(page, [
    [50, 0],
    [150, 50],
    [150, 0],
    [200, 0],
  ]);
  await undoByClick(page);
  await assertConnectorPath(page, [
    [50, 0],
    [200, 50],
  ]);
  await redoByClick(page);
  await assertConnectorPath(page, [
    [50, 0],
    [150, 50],
    [150, 0],
    [200, 0],
  ]);
  await redoByClick(page);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -50],
    [100, -50],
  ]);
  await redoByClick(page);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -50],
    [150, -50],
    [150, -100],
  ]);
});

test('elbow connector both side attached element with one attach element and other is fixed', async ({
  page,
}) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [50, 0], [250, 50]);

  await assertConnectorPath(page, [
    [50, 0],
    [50, -20],
    [150, -20],
    [150, 50],
    [200, 50],
  ]);

  // select
  await dragBetweenViewCoords(page, [255, -10], [255, 55]);
  await dragBetweenViewCoords(page, [250, 50], [250, 0]);

  await assertConnectorPath(page, [
    [50, 0],
    [50, -20],
    [150, -20],
    [150, 0],
    [200, 0],
  ]);

  await dragBetweenViewCoords(page, [250, 0], [250, -20]);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -20],
    [200, -20],
  ]);

  await dragBetweenViewCoords(page, [250, -20], [150, -150]);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -50],
    [150, -50],
    [150, -100],
  ]);
});

test('elbow connector both side attached element with all fixed', async ({
  page,
}) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [50, 0], [300, 50]);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -20],
    [320, -20],
    [320, 50],
    [300, 50],
  ]);
});
