// @ts-check

/**
 * Default S1 thin-host entry module referenced by `index.html` `#affine-build-manifest`.
 * Presents a real first-frame clear on `#app-canvas` (preferring WebGPU, then
 * WebGL2, then 2D) before calling `host.markFirstFrameReady()` to remove `#boot`.
 * S2 replaces `appEntryJs` with the bundled Wasm UI runtime.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ bindWebGpuDevice?: (device: unknown) => void }} host
 * @returns {Promise<boolean>}
 */
async function presentFirstFrameClear(canvas, host) {
  const gpu =
    /** @type {{ requestAdapter?: () => Promise<any>, getPreferredCanvasFormat?: () => string } | undefined} */ (
      globalThis.navigator?.gpu
    );
  if (gpu && typeof gpu.requestAdapter === 'function') {
    try {
      const adapter = await gpu.requestAdapter();
      const device = adapter ? await adapter.requestDevice() : null;
      const context = device ? canvas.getContext('webgpu') : null;
      if (device && context && typeof context.configure === 'function') {
        host.bindWebGpuDevice?.(device);
        context.configure({
          device,
          format: gpu.getPreferredCanvasFormat?.() || 'bgra8unorm',
        });
        const texture = context.getCurrentTexture?.();
        const encoder = device.createCommandEncoder?.();
        if (texture && encoder) {
          const pass = encoder.beginRenderPass({
            colorAttachments: [
              {
                view: texture.createView(),
                loadOp: 'clear',
                storeOp: 'store',
                clearValue: { r: 0.078, g: 0.078, b: 0.078, a: 1 },
              },
            ],
          });
          pass.end();
          device.queue.submit([encoder.finish()]);
          return true;
        }
      }
    } catch {
      // Fall through to WebGL2 / 2D clear.
    }
  }

  if (typeof canvas.getContext === 'function') {
    const gl = /** @type {WebGL2RenderingContext | null} */ (
      canvas.getContext('webgl2')
    );
    if (gl) {
      gl.clearColor(0.078, 0.078, 0.078, 1);
      gl.clear(gl.COLOR_BUFFER_BIT ?? 0x4000);
      return true;
    }

    const ctx2d = canvas.getContext('2d');
    if (ctx2d) {
      ctx2d.fillStyle = '#141414';
      ctx2d.fillRect(0, 0, canvas.width || 1, canvas.height || 1);
      return true;
    }
  }

  return false;
}

const host =
  /** @type {{ canvas?: HTMLCanvasElement | null, bindCanvas?: (c: HTMLCanvasElement | null) => void, bindWebGpuDevice?: (d: unknown) => void, markFirstFrameReady?: () => void, handleRuntimeGpuLoss?: () => Promise<unknown> } | undefined} */ (
    /** @type {unknown} */ (
      globalThis.window?.__AFFINE_WEB_HOST__ ?? globalThis.__AFFINE_WEB_HOST__
    )
  );

let firstFrameCleared = false;
if (host) {
  host.bindCanvas?.(host.canvas ?? null);
  if (host.canvas) {
    firstFrameCleared = await presentFirstFrameClear(host.canvas, host);
  }
  if (firstFrameCleared) {
    host.markFirstFrameReady?.();
  } else {
    await host.handleRuntimeGpuLoss?.();
  }
}

export const defaultAppEntryReady = firstFrameCleared;
