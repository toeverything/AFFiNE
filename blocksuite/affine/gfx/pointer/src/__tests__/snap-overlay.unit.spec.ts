import { Point } from '@blocksuite/global/gfx';
import { SnapOverlay } from "../snap/snap-overlay";
import { GfxCompatibleBlockModel } from "../../../../../framework/std/src/gfx/model/gfx-block-model";

describe('SnapOverlay', () => {
  let snapOverlay: SnapOverlay;
  let mockGfxController: GfxController;

  beforeEach(() => {
    // Mock GfxController
    mockGfxController = {
      viewport: {
        zoom: 1,
      },
      grid: {
        search: () => new Set(),
      },
    } as GfxController;
    snapOverlay = new SnapOverlay(mockGfxController);
  });

  describe('snapDragAngle', () => {
    const startPoint = new Point(0, 0);

    it('should not snap if shift is not pressed', () => {
      const currentPoint = new Point(10, 5);
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, false);
      expect(snappedPoint.x).toBeCloseTo(currentPoint.x);
      expect(snappedPoint.y).toBeCloseTo(currentPoint.y);
    });

    it('should return currentPoint if start and current points are identical', () => {
      const currentPoint = new Point(0, 0);
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      expect(snappedPoint.x).toBeCloseTo(currentPoint.x);
      expect(snappedPoint.y).toBeCloseTo(currentPoint.y);
    });

    it('should snap to 0 degrees (horizontal) when dragging right with shift', () => {
      const currentPoint = new Point(10, 2);
      const initialDistance = Math.hypot(currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      expect(snappedPoint.x).toBeCloseTo(initialDistance);
      expect(snappedPoint.y).toBeCloseTo(0);
    });

    it('should snap to 45 degrees when dragging with shift near 45', () => {
      const currentPoint = new Point(10, 10 * Math.tan(Math.PI / 4 + Math.PI / 100));
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      expect(snappedPoint.x).toBeCloseTo(10);
      expect(snappedPoint.y).toBeCloseTo(10);
    });

    it('should snap to 90 degrees (vertical) when dragging down with shift', () => {
      const currentPoint = new Point(2, 10);
      const initialDistance = Math.hypot(currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      expect(snappedPoint.x).toBeCloseTo(0);
      expect(snappedPoint.y).toBeCloseTo(initialDistance);
    });

    it('should snap to 180 degrees (horizontal) when dragging left with shift', () => {
      const currentPoint = new Point(-10, 2);
      const initialDistance = Math.hypot(currentPoint.x - startPoint.x, currentPoint.y - startPoint.y);
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      expect(snappedPoint.x).toBeCloseTo(-initialDistance);
      expect(snappedPoint.y).toBeCloseTo(0);
    });

    it('should maintain distance after snapping', () => {
      const currentPoint = new Point(10, 5);
      const initialDistance = Math.sqrt(10 * 10 + 5 * 5);
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      const snappedDistance = Math.sqrt(
        (snappedPoint.x - startPoint.x) * (snappedPoint.x - startPoint.x) +
          (snappedPoint.y - startPoint.y) * (snappedPoint.y - startPoint.y)
      );
      expect(snappedDistance).toBeCloseTo(initialDistance);
    });

    it('should snap to -15 degrees (345 degrees) when dragging near negative 15 with shift', () => {
      const currentPoint = new Point(10 * Math.cos(-Math.PI / 12 - Math.PI / 100), 10 * Math.sin(-Math.PI / 12 - Math.PI / 100));
      const snappedPoint = snapOverlay.snapDragAngle(startPoint, currentPoint, true);
      expect(snappedPoint.x).toBeCloseTo(10 * Math.cos(-Math.PI / 12));
      expect(snappedPoint.y).toBeCloseTo(10 * Math.sin(-Math.PI / 12));
    });
  });
});
