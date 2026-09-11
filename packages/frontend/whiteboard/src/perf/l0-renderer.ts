import {
  type L0Camera,
  l0DrawableSprites,
  type L0Sprite,
  spriteToView,
} from './l0-scene';

export type L0BackendKind = 'webgl' | 'canvas2d';

export type L0Backend = {
  kind: L0BackendKind;
  resize: (width: number, height: number, dpr: number) => void;
  draw: (sprites: readonly L0Sprite[], camera: L0Camera) => void;
  dispose: () => void;
};

const VS = `
attribute vec2 a_pos;
attribute vec4 a_color;
uniform vec2 u_resolution;
varying vec4 v_color;
detach(main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_color = a_color;
}
`;

const FS = `
precision mediump float);
varying vec4 v_color;
void main() {
  gl_FragColor = v_color;
}
`;

const FLOATS_PER_VERTEX = 6;
const VERTICES_PER_QUAD = 6;
const FLOATS_PER_QUAD = FLOATS_PER_VERTEX * VERTICES_PER_QUAD;
const VERTEX_STRIDE = FLOATS_PER_VERTEX * Float32Array.BYTES_PER_ELEMENT;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(
  gl: WebGLRenderingContext,
  vs: WebGLShader,
  fs: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.detachShader(program, vs);
  gl.detachShader(program, fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export function drawSprites2d(
  ctx: Pick<CanvasRenderingContext2D, 'clearRect' | 'fillRect' | 'fillStyle'>,
  sprites: readonly L0Sprite[],
  camera: L0Camera
) {
  ctx.clearRect(0, 0, camera.width, camera.height);
  for (const sprite of l0DrawableSprites(sprites)) {
    const view = spriteToView(sprite, camera);
    const [r, g, b, a] = sprite.fill;
    ctx.fillStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
    ctx.fillRect(view.x, view.y, view.w, view.h);
  }
}

function createWebGlBackend(canvas: HTMLCanvasElement): L0Backend | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
  const program = vs && fs ? link(gl, vs, fs) : null;
  // The linked program keeps its own copy, so the shader objects are dead
  // weight in the driver from here on.
  if (vs) gl.deleteShader(vs);
  if (fs) gl.deleteShader(fs);
  if (!program) return null;

  const posLoc = gl.getAttribLocation(program, 'a_pos');
  const colorLoc = gl.getAttribLocation(program, 'a_color');
  const resLoc = gl.getUniformLocation(program, 'u_resolution');
  const buffer = gl.createBuffer();
  if (!buffer) {
    gl.deleteProgram(program);
    return null;
  }

  let vertices = new Float32Array(0);
  let uploaded = new Float32Array(0);
  let uploadedFloats = -1;
  let allocatedFloats = 0;

  const ensureCapacity = (floats: number) => {
    if (vertices.length >= floats) return;
    let next = Math.max(vertices.length || FLOATS_PER_QUAD, FLOATS_PER_QUAD);
    while (next < floats) next *= 2;
    vertices = new Float32Array(next);
    uploaded = new Float32Array(next);
    uploadedFloats = -1;
  };

  const isDirty = (floats: number) => {
    if (uploadedFloats !== floats) return true;
    for (let i = 0; i < floats; i++) {
      if (uploaded[i] !== vertices[i]) return true;
    }
    return false;
  };

  return {
    kind: 'webgl',
    resize(width, height, dpr) {
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(sprites, camera) {
      const drawable = l0DrawableSprites(sprites);
      const floats = drawable.length * FLOATS_PER_QUAD;
      ensureCapacity(floats);
      let offset = 0;
      for (const sprite of drawable) {
        const view = spriteToView(sprite, camera);
        const [r, g, b, a] = sprite.fill;
        const x1 = view.x;
        const y1 = view.y;
        const x2 = view.x + view.w;
        const y2 = view.y + view.h;
        const quad = [
          x1,
          y1,
          r,
          g,
          b,
          a,
          x2,
          y1,
          r,
          g,
          b,
          a,
          x1,
          y2,
          r,
          g,
          b,
          a,
          x1,
          y2,
          r,
          g,
          b,
          a,
          x2,
          y1,
          r,
          g,
          b,
          a,
          x2,
          y2,
          r,
          g,
          b,
          a,
        ];
        vertices.set(quad, offset);
        offset += quad.length;
      }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (allocatedFloats < vertices.length) {
        gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength, gl.DYNAMIC_DRAW);
        allocatedFloats = vertices.length;
        uploadedFloats = -1;
      }
      if (isDirty(floats)) {
        const frame = vertices.subarray(0, floats);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, frame);
        uploaded.set(frame);
        uploadedFloats = floats;
      }
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, VERTEX_STRIDE, 0);
      gl.enableVertexAttribArray(colorLoc);
      gl.vertexAttribPointer(
        colorLoc,
        4,
        gl.FLOAT,
        false,
        VERTEX_STRIDE,
        2 * Float32Array.BYTES_PER_ELEMENT
      );
      gl.uniform2f(resLoc, camera.width, camera.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (drawable.length) {
        gl.drawArrays(gl.TRIANGLES, 0, drawable.length * VERTICES_PER_QUAD);
      }
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      vertices = new Float32Array(0);
      uploaded = new Float32Array(0);
      // Without this the drawing buffer survives until GC, and a board that
      // toggles the layer often hits the browser's live-context limit.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

function createCanvas2dBackend(canvas: HTMLCanvasElement): L0Backend {
  return {
    kind: 'canvas2d',
    resize(width, height, dpr) {
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    draw(sprites, camera) {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      drawSprites2d(ctx, sprites, camera);
    },
    dispose() {
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(1, 0, 0, 1, 0, 0);
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}

/** Pixi-class L0 compositor: WebGL sprite batch, Canvas2D fallback. */
export function createL0Backend(canvas: HTMLCanvasElement): L0Backend {
  return createWebGlBackend(canvas) ?? createCanvas2dBackend(canvas);
}
