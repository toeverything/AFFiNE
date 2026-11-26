// @ts-check

import {
  createSelectionOverlayController,
  drawSelectionOverlay,
  SELECTION_MENU_FONT,
} from './selection-overlay.js';

/**
 * Default thin-host entry module referenced by `index.html`.
 * Presents a first-frame clear on `#app-canvas` (WebGPU, then WebGL2, then 2D)
 * before calling `host.markFirstFrameReady()` to remove `#boot`.
 * Wires `webglcontextrestored`, WebGPU-to-WebGL2 replacement-canvas downgrade,
 * and canvas-drawn selection overlay pointer/clipboard handling directly on
 * `#app-canvas`.
 */

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
out vec4 outColor;
void main() {
  outColor = texture(u_tex, v_uv);
}`;

/**
 * Uploads a 2D offscreen canvas onto a WebGL2 `#app-canvas` via a full-screen
 * textured quad. Falls back to `gl.clear(...)` when minimal mock contexts omit
 * shader methods.
 *
 * @param {WebGL2RenderingContext} gl
 * @param {HTMLCanvasElement | OffscreenCanvas | null} sourceCanvas
 * @returns {boolean}
 */
function presentWebGl2Frame(gl, sourceCanvas) {
  if (!sourceCanvas) {
    gl.clearColor?.(0.078, 0.078, 0.078, 1);
    gl.clear?.(gl.COLOR_BUFFER_BIT ?? 0x4000);
    return true;
  }
  if (
    typeof gl.createShader !== 'function' ||
    typeof gl.createProgram !== 'function' ||
    typeof gl.createTexture !== 'function' ||
    typeof gl.texImage2D !== 'function' ||
    typeof gl.drawArrays !== 'function'
  ) {
    return false;
  }

  /** @type {any} */
  const cache = gl;
  let state = cache.__affineQuadState;
  if (!state || gl.isContextLost?.()) {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    const prog = gl.createProgram();
    const buf = gl.createBuffer();
    const tex = gl.createTexture();
    if (!vs || !fs || !prog || !buf || !tex) {
      return false;
    }
    gl.shaderSource(vs, VERT_SRC);
    gl.compileShader(vs);
    gl.shaderSource(fs, FRAG_SRC);
    gl.compileShader(fs);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );
    state = {
      prog,
      buf,
      tex,
      posLoc: gl.getAttribLocation(prog, 'a_pos'),
    };
    cache.__affineQuadState = state;
  }

  gl.viewport?.(0, 0, gl.drawingBufferWidth || 1, gl.drawingBufferHeight || 1);
  gl.useProgram(state.prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, state.buf);
  gl.enableVertexAttribArray(state.posLoc);
  gl.vertexAttribPointer(state.posLoc, 2, gl.FLOAT, false, 0, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    /** @type {TexImageSource} */ (sourceCanvas)
  );
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return true;
}

/**
 * Clears or composites `#app-canvas` with WebGL2 or 2D fallback.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLCanvasElement | OffscreenCanvas | null} [sourceCanvas]
 * @returns {boolean}
 */
function paintWebGl2Or2d(canvas, sourceCanvas = null) {
  if (typeof canvas.getContext !== 'function') {
    return false;
  }
  const gl = /** @type {WebGL2RenderingContext | null} */ (
    canvas.getContext('webgl2')
  );
  if (gl) {
    return presentWebGl2Frame(gl, sourceCanvas);
  }

  const ctx2d = canvas.getContext('2d');
  if (ctx2d) {
    if (sourceCanvas) {
      if (typeof ctx2d.drawImage !== 'function') {
        return false;
      }
      ctx2d.clearRect?.(0, 0, canvas.width || 1, canvas.height || 1);
      ctx2d.drawImage(
        /** @type {CanvasImageSource} */ (sourceCanvas),
        0,
        0,
        canvas.width || 1,
        canvas.height || 1
      );
      return true;
    }
    ctx2d.fillStyle = '#141414';
    ctx2d.fillRect(0, 0, canvas.width || 1, canvas.height || 1);
    return true;
  }
  return false;
}

/**
 * Replaces a WebGPU-locked `<canvas id="app-canvas">` with a fresh DOM canvas
 * so WebGL2 context creation succeeds after WebGPU `device.lost`.
 *
 * @param {HTMLCanvasElement} oldCanvas
 * @param {any} host
 * @returns {HTMLCanvasElement}
 */
function replaceCanvasForWebGl2Fallback(oldCanvas, host) {
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== 'function') {
    return oldCanvas;
  }
  const fresh = doc.createElement('canvas');
  fresh.id = oldCanvas.id || 'app-canvas';
  fresh.setAttribute?.('aria-hidden', 'true');
  const dpr = Math.max(1, globalThis.window?.devicePixelRatio || 1);
  const hasExplicitSize =
    oldCanvas.width > 0 &&
    oldCanvas.height > 0 &&
    !(oldCanvas.width === 300 && oldCanvas.height === 150);
  if (hasExplicitSize) {
    fresh.width = oldCanvas.width;
    fresh.height = oldCanvas.height;
  } else if (globalThis.window?.innerWidth && globalThis.window?.innerHeight) {
    fresh.width = Math.max(1, Math.round(globalThis.window.innerWidth * dpr));
    fresh.height = Math.max(1, Math.round(globalThis.window.innerHeight * dpr));
  } else {
    fresh.width = oldCanvas.width || 300;
    fresh.height = oldCanvas.height || 150;
  }
  if (typeof oldCanvas.replaceWith === 'function') {
    oldCanvas.replaceWith(fresh);
  }
  host.bindCanvas?.(fresh);
  return fresh;
}

/**
 * Presents a 2D surface or clear frame on a configured WebGPU canvas.
 *
 * @param {{ device: any, context: any, canvas: HTMLCanvasElement }} webGpuState
 * @param {HTMLCanvasElement | OffscreenCanvas | null} sourceCanvas
 * @returns {boolean}
 */
function presentWebGpuFrame(webGpuState, sourceCanvas) {
  const { device, context } = webGpuState;
  const texture = context.getCurrentTexture?.();
  if (!texture) {
    return false;
  }
  if (sourceCanvas) {
    if (
      typeof device.queue?.copyExternalImageToTexture !== 'function' ||
      typeof device.createCommandEncoder !== 'function' ||
      typeof device.queue?.submit !== 'function'
    ) {
      return false;
    }
    device.queue.copyExternalImageToTexture(
      { source: sourceCanvas },
      { texture },
      {
        width: sourceCanvas.width || webGpuState.canvas.width || 1,
        height: sourceCanvas.height || webGpuState.canvas.height || 1,
      }
    );
    const encoder = device.createCommandEncoder();
    if (!encoder) {
      return false;
    }
    device.queue.submit([encoder.finish()]);
    return true;
  }
  const encoder = device.createCommandEncoder?.();
  if (encoder && typeof device.queue?.submit === 'function') {
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
  return false;
}

/**
 * Creates an offscreen 2D staging canvas never mounted in the DOM.
 *
 * @param {number} width
 * @param {number} height
 * @returns {HTMLCanvasElement | OffscreenCanvas | null}
 */
function createOffscreenSurface(width, height) {
  if (typeof OffscreenCanvas === 'function') {
    return new OffscreenCanvas(width, height);
  }
  const doc = globalThis.document;
  if (doc && typeof doc.createElement === 'function') {
    const c = doc.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  return null;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {any} host
 * @param {() => HTMLCanvasElement | OffscreenCanvas | null} getSourceCanvas
 * @param {(nextCanvas: HTMLCanvasElement) => void} onCanvasReplaced
 * @param {(state: { device: any, context: any, canvas: HTMLCanvasElement } | null) => void} setWebGpuState
 * @returns {Promise<boolean>}
 */
async function presentFirstFrameClear(
  canvas,
  host,
  getSourceCanvas,
  onCanvasReplaced,
  setWebGpuState
) {
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
        host.bindWebGpuDevice?.(device, {
          tryWebGl2Fallback: () => {
            setWebGpuState(null);
            const nextCanvas = replaceCanvasForWebGl2Fallback(
              host.canvas || canvas,
              host
            );
            onCanvasReplaced(nextCanvas);
            return paintWebGl2Or2d(nextCanvas, getSourceCanvas());
          },
        });
        const renderAttachment =
          globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10;
        const copyDst = globalThis.GPUTextureUsage?.COPY_DST ?? 0x02;
        context.configure({
          device,
          format: gpu.getPreferredCanvasFormat?.() || 'bgra8unorm',
          usage: renderAttachment | copyDst,
        });
        const gpuState = { device, context, canvas };
        if (presentWebGpuFrame(gpuState, getSourceCanvas())) {
          setWebGpuState(gpuState);
          return true;
        }
      }
    } catch {
      setWebGpuState(null);
      // Fall through to WebGL2 or 2D clear.
    }
  }

  return paintWebGl2Or2d(canvas, getSourceCanvas());
}

/**
 * Attaches the canvas-drawn selection overlay controller and pointer listeners
 * directly to `#app-canvas` for production `index.html`.
 *
 * @param {any} host
 */
function attachSelectionOverlayRuntime(host) {
  /** @type {HTMLCanvasElement | OffscreenCanvas | null} */
  let stageSurface = null;
  /** @type {{ device: any, context: any, canvas: HTMLCanvasElement } | null} */
  let webGpuState = null;
  /** @type {((ctx: CanvasRenderingContext2D, vw: number, vh: number) => void) | null} */
  let scenePainter = null;
  /** @type {any} */
  let selectionInput = null;
  /** @type {'light' | 'dark'} */
  let overlayTheme = 'light';
  /** @type {{ getSelectedText?: () => string, getSelectionToken?: () => unknown, deleteSelection?: (captured?: unknown) => void, insertText?: (t: string) => void, selectAll?: () => void, onDragHandle?: (h: 'start' | 'end', x: number, y: number) => void, onActionResult?: (r: any) => void, clipboard?: any, isSecureContext?: boolean } | null} */
  let selectionCallbacks = null;
  /** @type {HTMLCanvasElement | null} */
  let pointerCanvas = null;
  let sceneEpoch = 0;

  /**
   * Presents `surface` to `activeCanvas` via WebGPU (with automatic
   * replacement-canvas fallback to WebGL2/2D when needed) or WebGL2/2D.
   *
   * @param {HTMLCanvasElement} activeCanvas
   * @param {HTMLCanvasElement | OffscreenCanvas | null} surface
   * @returns {boolean}
   */
  function presentSurface(activeCanvas, surface) {
    if (webGpuState && webGpuState.canvas === activeCanvas) {
      try {
        if (presentWebGpuFrame(webGpuState, surface)) {
          return true;
        }
      } catch {
        // Fall back to a fresh WebGL2/2D canvas below.
      }
      webGpuState = null;
      const nextCanvas = replaceCanvasForWebGl2Fallback(activeCanvas, host);
      bindPointerCanvas(nextCanvas);
      return paintWebGl2Or2d(nextCanvas, surface);
    }
    return paintWebGl2Or2d(activeCanvas, surface);
  }

  function renderCompositeFrame() {
    const activeCanvas = host.canvas;
    if (!activeCanvas) {
      return false;
    }
    if (!scenePainter && !selectionInput) {
      return presentSurface(activeCanvas, null);
    }
    const dpr = Math.max(1, globalThis.window?.devicePixelRatio || 1);
    const vw =
      globalThis.window?.innerWidth ||
      Math.max(1, Math.round((activeCanvas.width || 390) / dpr));
    const vh =
      globalThis.window?.innerHeight ||
      Math.max(1, Math.round((activeCanvas.height || 844) / dpr));
    const pixelW = Math.max(1, Math.round(vw * dpr));
    const pixelH = Math.max(1, Math.round(vh * dpr));
    if (activeCanvas.width !== pixelW || activeCanvas.height !== pixelH) {
      activeCanvas.width = pixelW;
      activeCanvas.height = pixelH;
    }
    if (
      !stageSurface ||
      stageSurface.width !== pixelW ||
      stageSurface.height !== pixelH
    ) {
      stageSurface = createOffscreenSurface(pixelW, pixelH);
    }
    if (!stageSurface) {
      return false;
    }
    const ctx = /** @type {CanvasRenderingContext2D | null} */ (
      stageSurface.getContext('2d')
    );
    if (!ctx) {
      return false;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (scenePainter) {
      scenePainter(ctx, vw, vh);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, vw, vh);
    }
    const layout = selectionController.getLayout();
    if (layout) {
      drawSelectionOverlay(ctx, layout, {
        theme: overlayTheme,
        activeActionId: selectionController.getActiveActionId(),
      });
    }
    return presentSurface(activeCanvas, stageSurface);
  }

  /** @param {string} label */
  function measureMenuLabel(label) {
    const ctx = /** @type {CanvasRenderingContext2D | null} */ (
      stageSurface?.getContext?.('2d') ?? null
    );
    if (!ctx || typeof ctx.measureText !== 'function') {
      return Number.NaN;
    }
    ctx.save?.();
    ctx.font = SELECTION_MENU_FONT;
    const width = ctx.measureText(label)?.width ?? Number.NaN;
    ctx.restore?.();
    return width;
  }

  const selectionController = createSelectionOverlayController({
    getInput: () => {
      if (!selectionInput) {
        return null;
      }
      const explicitLocale =
        typeof selectionInput.locale === 'string'
          ? selectionInput.locale.trim()
          : '';
      let resolvedLocale = explicitLocale;
      if (!resolvedLocale) {
        resolvedLocale = host?.getPreferredLocale?.() || '';
      }
      if (!resolvedLocale) {
        try {
          resolvedLocale = globalThis.navigator?.language || '';
        } catch {
          resolvedLocale = '';
        }
      }
      return {
        ...selectionInput,
        locale: resolvedLocale || undefined,
      };
    },
    measureText: measureMenuLabel,
    onDragHandle: (handle, x, y) => {
      selectionCallbacks?.onDragHandle?.(handle, x, y);
    },
    onAction: async action => {
      const activeCallbacks = selectionCallbacks;
      if (!activeCallbacks) {
        return null;
      }
      const actionEpoch = sceneEpoch;
      const isActiveScene = () =>
        sceneEpoch === actionEpoch && selectionCallbacks === activeCallbacks;
      const res = await host.executeClipboardAction({
        action,
        getSelectedText: () =>
          isActiveScene() && activeCallbacks.getSelectedText
            ? activeCallbacks.getSelectedText()
            : '',
        getSelectionToken:
          typeof activeCallbacks.getSelectionToken === 'function'
            ? () =>
                isActiveScene()
                  ? activeCallbacks.getSelectionToken()
                  : Symbol('stale-scene')
            : undefined,
        deleteSelection:
          typeof activeCallbacks.deleteSelection === 'function'
            ? arg => {
                if (isActiveScene()) {
                  activeCallbacks.deleteSelection(arg);
                }
              }
            : undefined,
        insertText:
          typeof activeCallbacks.insertText === 'function'
            ? text => {
                if (isActiveScene()) {
                  activeCallbacks.insertText(text);
                }
              }
            : undefined,
        selectAll:
          typeof activeCallbacks.selectAll === 'function'
            ? () => {
                if (isActiveScene()) {
                  activeCallbacks.selectAll();
                }
              }
            : undefined,
        clipboard: activeCallbacks.clipboard,
        isSecureContext: activeCallbacks.isSecureContext,
      });
      if (!isActiveScene()) {
        return res;
      }
      activeCallbacks.onActionResult?.(res);
      renderCompositeFrame();
      return res;
    },
    onLayoutChange: () => {
      renderCompositeFrame();
    },
  });

  /** @param {PointerEvent} event */
  function toCanvasCoords(event) {
    const rect = pointerCanvas?.getBoundingClientRect?.();
    return {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    };
  }

  /** @param {PointerEvent} event */
  function handlePointerDown(event) {
    const { x, y } = toCanvasCoords(event);
    const res = selectionController.onPointerDown(x, y);
    if (res.handled) {
      event.preventDefault?.();
    }
  }

  /** @param {PointerEvent} event */
  function handlePointerMove(event) {
    const { x, y } = toCanvasCoords(event);
    if (selectionController.onPointerMove(x, y)) {
      event.preventDefault?.();
    }
  }

  /** @param {PointerEvent} event */
  function handlePointerUp(event) {
    const { x, y } = toCanvasCoords(event);
    const res = selectionController.onPointerUp(x, y);
    if (res.handled) {
      event.preventDefault?.();
    }
  }

  function handlePointerCancel() {
    selectionController.onPointerCancel();
  }

  /** @param {HTMLCanvasElement | null} nextCanvas */
  function bindPointerCanvas(nextCanvas) {
    if (pointerCanvas === nextCanvas) {
      return;
    }
    if (
      pointerCanvas &&
      typeof pointerCanvas.removeEventListener === 'function'
    ) {
      pointerCanvas.removeEventListener('pointerdown', handlePointerDown);
      pointerCanvas.removeEventListener('pointermove', handlePointerMove);
      pointerCanvas.removeEventListener('pointerup', handlePointerUp);
      pointerCanvas.removeEventListener('pointercancel', handlePointerCancel);
    }
    pointerCanvas = nextCanvas;
    if (pointerCanvas && typeof pointerCanvas.addEventListener === 'function') {
      pointerCanvas.addEventListener('pointerdown', handlePointerDown);
      pointerCanvas.addEventListener('pointermove', handlePointerMove);
      pointerCanvas.addEventListener('pointerup', handlePointerUp);
      pointerCanvas.addEventListener('pointercancel', handlePointerCancel);
    }
  }

  host.selectionOverlay = {
    controller: selectionController,
    /**
     * Configures the canvas scene painter and optional selection overlay input,
     * then composites the frame onto `#app-canvas`. Clears interactive
     * selection state if presenting fails so invisible buttons cannot be hit.
     *
     * @param {{ paint?: ((ctx: CanvasRenderingContext2D, vw: number, vh: number) => void) | null, selection?: any, theme?: 'light' | 'dark', callbacks?: any }} config
     */
    setScene(config) {
      sceneEpoch += 1;
      scenePainter = config.paint ?? null;
      selectionInput = config.selection ?? null;
      overlayTheme = config.theme || 'light';
      selectionCallbacks = config.callbacks ?? null;
      const presented = renderCompositeFrame();
      if (!presented) {
        selectionInput = null;
        selectionCallbacks = null;
        host.setSelectionOverlayActive?.(false);
        return false;
      }
      host.setSelectionOverlayActive?.(Boolean(selectionInput));
      return true;
    },
    renderFrame: renderCompositeFrame,
    getLayout: () => selectionController.getLayout(),
  };

  return {
    bindPointerCanvas,
    renderCompositeFrame,
    getSourceCanvas: () => stageSurface,
    setWebGpuState: state => {
      webGpuState = state;
    },
  };
}

const host = /** @type {any} */ (
  globalThis.window?.__AFFINE_WEB_HOST__ ?? globalThis.__AFFINE_WEB_HOST__
);

let firstFrameCleared = false;
if (host) {
  const overlayRuntime = attachSelectionOverlayRuntime(host);
  host.bindCanvas?.(host.canvas ?? null);
  overlayRuntime.bindPointerCanvas(host.canvas ?? null);
  host.setGraphicsRecoveryHooks?.({
    onContextRestored: activeCanvas => {
      if (!activeCanvas) {
        return false;
      }
      const gl = activeCanvas.getContext?.('webgl2');
      if (gl && /** @type {any} */ (gl).__affineQuadState) {
        delete (/** @type {any} */ (gl).__affineQuadState);
      }
      return overlayRuntime.renderCompositeFrame();
    },
  });
  if (host.canvas) {
    firstFrameCleared = await presentFirstFrameClear(
      host.canvas,
      host,
      overlayRuntime.getSourceCanvas,
      nextCanvas => overlayRuntime.bindPointerCanvas(nextCanvas),
      state => overlayRuntime.setWebGpuState(state)
    );
  }
  if (firstFrameCleared) {
    host.markFirstFrameReady?.();
  } else {
    await host.handleRuntimeGpuLoss?.();
  }
}

export const defaultAppEntryReady = firstFrameCleared;
