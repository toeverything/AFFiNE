import { test } from '@affine-test/kit/playwright';
import {
  type CanvasRendererPerfSnapshot,
  deleteEdgelessElements,
  getCanvasRendererPerfSnapshot,
  resetCanvasRendererPerfMetrics,
  seedEdgelessPerfScene,
} from '@affine-test/kit/utils/edgeless-perf';
import {
  clickEdgelessModeButton,
  dragView,
  fitViewportToContent,
  getEdgelessSelectedIds,
  getSelectedXYWH,
  locateEditorContainer,
  setEdgelessTool,
  setViewportZoom,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

const PERF_ENV = 'AFFINE_RUN_PERF_E2E';
const perfEnabled = process.env[PERF_ENV] === '1';
const modKey = process.platform === 'darwin' ? 'Meta' : 'Control';

type PerfScenarioResult = {
  name: string;
  snapshot: CanvasRendererPerfSnapshot;
};

test.describe.serial('canvas renderer perf probes', () => {
  test.skip(!perfEnabled, `Set ${PERF_ENV}=1 to run manual perf probes`);

  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await clickNewPageButton(page);
    await clickEdgelessModeButton(page);
    await locateEditorContainer(page).click();
  });

  test('collect metrics for common edgeless canvas scenarios', async ({
    page,
  }, testInfo) => {
    test.slow();

    const results: PerfScenarioResult[] = [];
    let addedShapeIds: string[] = [];

    const selectWholePerfScene = async () => {
      await setEdgelessTool(page, 'default');
      await dragView(page, [80, 140], [2300, 1500]);
      await expect
        .poll(async () => (await getEdgelessSelectedIds(page)).length)
        .toBeGreaterThan(0);
    };

    const recordScenario = async (
      name: string,
      action: () => Promise<void>
    ) => {
      await resetCanvasRendererPerfMetrics(page);
      await action();
      await page.waitForTimeout(400);

      const snapshot = await getCanvasRendererPerfSnapshot(page);
      results.push({ name, snapshot });
      console.log(
        `[canvas-perf] ${name}: ${JSON.stringify(snapshot.metrics, null, 2)}`
      );
    };

    const initial = await seedEdgelessPerfScene(page, {
      shapeCount: 120,
      rowLength: 12,
      startX: 120,
      startY: 180,
      width: 160,
      height: 120,
    });
    addedShapeIds = initial.shapeIds;

    await fitViewportToContent(page);
    await page.waitForTimeout(500);

    await recordScenario('add-shapes', async () => {
      const seeded = await seedEdgelessPerfScene(page, {
        shapeCount: 40,
        rowLength: 10,
        startX: 160,
        startY: 1720,
        width: 160,
        height: 120,
      });
      addedShapeIds = addedShapeIds.concat(seeded.shapeIds);
      await fitViewportToContent(page);
    });

    await recordScenario('delete-shapes', async () => {
      await deleteEdgelessElements(page, addedShapeIds.slice(-20));
    });

    await recordScenario('box-select', async () => {
      await selectWholePerfScene();
    });

    await recordScenario('group-selection', async () => {
      await selectWholePerfScene();
      await page.keyboard.press(`${modKey}+g`);
    });

    await recordScenario('ungroup-selection', async () => {
      await page.keyboard.press(`${modKey}+Shift+g`);
    });

    await recordScenario('large-drag-selection', async () => {
      await selectWholePerfScene();
      const [x, y, w, h] = await getSelectedXYWH(page);
      const center: [number, number] = [x + w / 2, y + h / 2];
      await dragView(page, center, [center[0] + 1200, center[1] + 900]);
    });

    await recordScenario('large-pan', async () => {
      await setEdgelessTool(page, 'pan');
      await dragView(page, [1200, 900], [200, 180]);
    });

    await recordScenario('large-zoom', async () => {
      await setViewportZoom(page, 0.25);
      await page.waitForTimeout(200);
      await setViewportZoom(page, 2.2);
      await page.waitForTimeout(200);
      await fitViewportToContent(page);
    });

    const finalSnapshot = await getCanvasRendererPerfSnapshot(page);

    expect(finalSnapshot.rendererType).toBe('CanvasRenderer');
    expect(results.length).toBeGreaterThanOrEqual(7);

    await testInfo.attach('canvas-renderer-perf-scenarios.json', {
      body: JSON.stringify(results, null, 2),
      contentType: 'application/json',
    });
  });

  test('collect metrics for interleaved block and canvas layers', async ({
    page,
  }, testInfo) => {
    test.slow();

    await seedEdgelessPerfScene(page, {
      interleaved: true,
      noteCount: 21,
      shapeCount: 20,
      rowLength: 1,
      startX: 120,
      startY: 180,
      width: 180,
      height: 120,
    });

    await fitViewportToContent(page);
    await page.waitForTimeout(500);

    const snapshot = await getCanvasRendererPerfSnapshot(page);
    const metrics = snapshot.metrics as {
      canvasMemoryMegabytes?: number;
      lastRenderMetrics?: {
        renderByBoundCallCount?: number;
      };
      stackingCanvasCount?: number;
      visibleStackingCanvasCount?: number;
    } | null;
    console.log(
      `[canvas-perf] interleaved-layers: ${JSON.stringify(snapshot, null, 2)}`
    );

    expect(snapshot.rendererType).toBe('CanvasRenderer');
    expect(metrics).not.toBeNull();
    expect(metrics?.stackingCanvasCount ?? 0).toBeGreaterThan(0);
    expect(
      metrics?.lastRenderMetrics?.renderByBoundCallCount ?? 0
    ).toBeGreaterThan(1);
    expect(metrics?.visibleStackingCanvasCount ?? 0).toBeGreaterThan(0);
    expect(metrics?.canvasMemoryMegabytes ?? 0).toBeLessThan(5);

    await testInfo.attach('canvas-renderer-layering.json', {
      body: JSON.stringify(snapshot, null, 2),
      contentType: 'application/json',
    });
  });
});
