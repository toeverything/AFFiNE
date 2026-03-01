import { expect } from '@playwright/test';

import {
  createConnectorElement,
  createShapeElement,
  deleteAllConnectors,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  getConnectorPath,
  redoByClick,
  setEdgelessTool,
  Shape,
  undoByClick,
} from '../../utils/actions/index.js';
import { test } from '../../utils/playwright.js';

const defaultTolerance = 1;

const within = (value: number, min: number, max: number, tolerance = 0) =>
  value >= min - tolerance && value <= max + tolerance;

const isClose = (value: number, expected: number, tolerance = 0) =>
  Math.abs(value - expected) <= tolerance;

const pointNear = (point: number[], expected: number[], tolerance = 0) =>
  isClose(point[0], expected[0], tolerance) &&
  isClose(point[1], expected[1], tolerance);

const pointInRect = (
  point: number[],
  rect: { minX: number; maxX: number; minY: number; maxY: number },
  tolerance = 0
) => {
  return (
    within(point[0], rect.minX, rect.maxX, tolerance) &&
    within(point[1], rect.minY, rect.maxY, tolerance)
  );
};

const expectOrthogonalPath = (path: number[][], tolerance = 0) => {
  for (let i = 1; i < path.length; i += 1) {
    const [x1, y1] = path[i - 1];
    const [x2, y2] = path[i];
    expect(
      Math.abs(x1 - x2) <= tolerance || Math.abs(y1 - y2) <= tolerance
    ).toBe(true);
  }
};

const expectPathConnectsRectToPoint = (
  path: number[][],
  rect: { minX: number; maxX: number; minY: number; maxY: number },
  point: number[],
  tolerance = 0
) => {
  const start = path[0];
  const end = path[path.length - 1];
  const startOnRect = pointInRect(start, rect, tolerance);
  const endOnRect = pointInRect(end, rect, tolerance);
  const startNearPoint = pointNear(start, point, tolerance);
  const endNearPoint = pointNear(end, point, tolerance);
  expect((startOnRect && endNearPoint) || (endOnRect && startNearPoint)).toBe(
    true
  );
};

const expectPathConnectsRects = (
  path: number[][],
  rectA: { minX: number; maxX: number; minY: number; maxY: number },
  rectB: { minX: number; maxX: number; minY: number; maxY: number },
  tolerance = 0
) => {
  const start = path[0];
  const end = path[path.length - 1];
  const startOnA = pointInRect(start, rectA, tolerance);
  const endOnA = pointInRect(end, rectA, tolerance);
  const startOnB = pointInRect(start, rectB, tolerance);
  const endOnB = pointInRect(end, rectB, tolerance);
  expect((startOnA && endOnB) || (startOnB && endOnA)).toBe(true);
};

const getFreeEnd = (
  path: number[][],
  rect: { minX: number; maxX: number; minY: number; maxY: number },
  tolerance = 0
) => {
  const start = path[0];
  const end = path[path.length - 1];
  if (pointInRect(start, rect, tolerance)) {
    return end;
  }
  if (pointInRect(end, rect, tolerance)) {
    return start;
  }
  return end;
};

const leftSquare = { minX: 0, maxX: 100, minY: 0, maxY: 100 };
const rightSquare = { minX: 200, maxX: 300, minY: 0, maxY: 100 };

test('elbow connector without node and width greater than height', async ({
  page,
}) => {
  await commonSetup(page);
  await setEdgelessTool(page, 'connector');
  await dragBetweenViewCoords(page, [0, 0], [200, 100]);
  const path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(3);
  expect(pointNear(path[0], [0, 0], defaultTolerance)).toBe(true);
  expect(pointNear(path[path.length - 1], [200, 100], defaultTolerance)).toBe(
    true
  );
  expectOrthogonalPath(path, defaultTolerance);
});

test('elbow connector without node and width less than height', async ({
  page,
}) => {
  await commonSetup(page);
  await createConnectorElement(page, [0, 0], [100, 200]);
  const path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(3);
  expect(pointNear(path[0], [0, 0], defaultTolerance)).toBe(true);
  expect(pointNear(path[path.length - 1], [100, 200], defaultTolerance)).toBe(
    true
  );
  expectOrthogonalPath(path, defaultTolerance);
});

test('elbow connector one side attached element another side free', async ({
  page,
}) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createConnectorElement(page, [51, 50], [200, 0]);

  let path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(2);
  expectPathConnectsRectToPoint(path, leftSquare, [200, 0], defaultTolerance);
  expectOrthogonalPath(path, defaultTolerance);

  await deleteAllConnectors(page);
  await createConnectorElement(page, [50, 50], [125, 0]);

  path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(2);
  expectPathConnectsRectToPoint(path, leftSquare, [125, 0], defaultTolerance);
  expectOrthogonalPath(path, defaultTolerance);
});

test('elbow connector both side attatched element', async ({ page }) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [50, 50], [249, 50]);

  let path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(2);
  expectPathConnectsRects(path, leftSquare, rightSquare, defaultTolerance);
  expectOrthogonalPath(path, defaultTolerance);
  const pathInitial = path;

  // Could drag directly
  // because the default shape type change to general style with filled color
  await dragBetweenViewCoords(page, [250, 50], [250, 0]);
  path = await getConnectorPath(page);
  expect(path).not.toEqual(pathInitial);
  expectPathConnectsRects(path, leftSquare, rightSquare, defaultTolerance);
  expectOrthogonalPath(path, defaultTolerance);
  const pathAfterFirstDrag = path;

  await dragBetweenViewCoords(page, [250, 0], [150, -50]);
  path = await getConnectorPath(page);
  expect(path).not.toEqual(pathAfterFirstDrag);
  expect(
    pointInRect(path[0], leftSquare, defaultTolerance) ||
      pointInRect(path[path.length - 1], leftSquare, defaultTolerance)
  ).toBe(true);
  const freeEnd = getFreeEnd(path, leftSquare, defaultTolerance);
  expect(freeEnd[1]).toBeLessThanOrEqual(-40);
  expectOrthogonalPath(path, defaultTolerance);
  const pathAfterSecondDrag = path;
  const freeEndAfterSecondDrag = freeEnd;

  await dragBetweenViewCoords(page, [150, -50], [150, -150]);
  path = await getConnectorPath(page);
  expect(path).not.toEqual(pathAfterSecondDrag);
  const freeEndAfterThirdDrag = getFreeEnd(path, leftSquare, defaultTolerance);
  expect(freeEndAfterThirdDrag[1]).toBeLessThan(freeEndAfterSecondDrag[1]);
  expectOrthogonalPath(path, defaultTolerance);
  const pathAfterThirdDrag = path;

  await undoByClick(page);
  path = await getConnectorPath(page);
  expect(path).toEqual(pathAfterSecondDrag);
  await undoByClick(page);
  path = await getConnectorPath(page);
  expect(path).toEqual(pathAfterFirstDrag);
  await undoByClick(page);
  path = await getConnectorPath(page);
  expect(path).toEqual(pathInitial);
  await redoByClick(page);
  path = await getConnectorPath(page);
  expect(path).toEqual(pathAfterFirstDrag);
  await redoByClick(page);
  path = await getConnectorPath(page);
  expect(path).toEqual(pathAfterSecondDrag);
  await redoByClick(page);
  path = await getConnectorPath(page);
  expect(path).toEqual(pathAfterThirdDrag);
});

test('elbow connector both side attached element with one attach element and other is fixed', async ({
  page,
}) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [50, 0], [250, 50]);

  let path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(2);
  expectPathConnectsRects(path, leftSquare, rightSquare, defaultTolerance);
  expectOrthogonalPath(path, defaultTolerance);
  const pathInitial = path;

  // select
  await dragBetweenViewCoords(page, [255, -10], [255, 55]);
  await dragBetweenViewCoords(page, [250, 50], [250, 0]);

  path = await getConnectorPath(page);
  expect(path).not.toEqual(pathInitial);
  expect(
    pointInRect(path[0], rightSquare, defaultTolerance) ||
      pointInRect(path[path.length - 1], rightSquare, defaultTolerance)
  ).toBe(true);
  const freeEndAfterFirstDrag = getFreeEnd(path, rightSquare, defaultTolerance);
  expect(freeEndAfterFirstDrag[1]).toBeLessThanOrEqual(0);
  expectOrthogonalPath(path, defaultTolerance);
  const pathAfterFirstDrag = path;

  await dragBetweenViewCoords(page, [250, 0], [250, -20]);
  path = await getConnectorPath(page);
  expect(path).not.toEqual(pathAfterFirstDrag);
  const freeEnd = getFreeEnd(path, leftSquare, defaultTolerance);
  expect(freeEnd[1]).toBeLessThanOrEqual(-10);
  expectOrthogonalPath(path, defaultTolerance);
  const pathAfterSecondDrag = path;
  const freeEndAfterSecondDrag = freeEnd;

  await dragBetweenViewCoords(page, [250, -20], [150, -150]);
  path = await getConnectorPath(page);
  expect(path).not.toEqual(pathAfterSecondDrag);
  const freeEndAfterThirdDrag = getFreeEnd(path, leftSquare, defaultTolerance);
  expect(freeEndAfterThirdDrag[1]).toBeLessThan(freeEndAfterSecondDrag[1]);
  expectOrthogonalPath(path, defaultTolerance);
});

test('elbow connector both side attached element with all fixed', async ({
  page,
}) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [50, 0], [300, 50]);
  const path = await getConnectorPath(page);
  expect(path.length).toBeGreaterThanOrEqual(2);
  expectPathConnectsRects(path, leftSquare, rightSquare, defaultTolerance);
  expectOrthogonalPath(path, defaultTolerance);
});
