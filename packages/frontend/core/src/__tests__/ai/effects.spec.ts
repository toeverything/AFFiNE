import { Window } from 'happy-dom';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('@dotlottie/player-component', () => ({}));
vi.mock('@affine/component', () => ({
  createReactComponentFromLit: () => () => null,
  toast: () => undefined,
}));
vi.mock('@affine/track', () => ({
  __esModule: true,
  default: () => undefined,
}));
vi.mock('@affine/core/blocksuite/manager/view', () => ({
  getViewManager: () => ({
    config: {
      init: () => ({
        value: {
          get: () => [],
        },
      }),
    },
  }),
}));

describe('ai effects registration split', () => {
  const testTimeout = process.env.CI ? 30000 : 10000;
  const originalCustomElements = globalThis.customElements;
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;
  const originalLocation = globalThis.location;
  const originalImage = globalThis.Image;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

  const applyDomGlobals = (dom: Window) => {
    const globals = globalThis as unknown as Record<string, unknown>;
    globals.window = dom;
    globals.document = dom.document;
    globals.HTMLElement = dom.HTMLElement;
    globals.Image = dom.Image ?? class {};
    globals.customElements = dom.customElements;
    globals.location = dom.location;
    globals.requestAnimationFrame =
      dom.requestAnimationFrame?.bind(dom) ??
      ((cb: FrameRequestCallback) =>
        setTimeout(() => cb(performance.now()), 0));
    globals.cancelAnimationFrame =
      dom.cancelAnimationFrame?.bind(dom) ?? clearTimeout;
  };

  afterEach(() => {
    globalThis.customElements = originalCustomElements;
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.HTMLElement = originalHTMLElement;
    globalThis.location = originalLocation;
    globalThis.Image = originalImage;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
    vi.restoreAllMocks();
  });

  test(
    'registerAIEditorEffects skips app-only elements',
    async () => {
      const dom = new Window();
      applyDomGlobals(dom);
      const defineSpy = vi.spyOn(dom.customElements, 'define');

      const { registerAIEditorEffects } =
        await import('@affine/core/blocksuite/ai/effects/editor');

      registerAIEditorEffects();

      const defined = new Set(defineSpy.mock.calls.map(([name]) => name));

      expect(defined.has('affine-ai-chat')).toBe(true);
      expect(defined.has('chat-panel')).toBe(false);
      expect(defined.has('text-renderer')).toBe(true);
    },
    testTimeout
  );

  test(
    'registerAIAppEffects skips editor-only elements',
    async () => {
      const dom = new Window();
      applyDomGlobals(dom);
      const defineSpy = vi.spyOn(dom.customElements, 'define');

      const { registerAIAppEffects } =
        await import('@affine/core/blocksuite/ai/effects/app');

      registerAIAppEffects();

      const defined = new Set(defineSpy.mock.calls.map(([name]) => name));

      expect(defined.has('ai-chat-content')).toBe(true);
      expect(defined.has('chat-panel')).toBe(false);
      expect(defined.has('affine-ai-chat')).toBe(false);
      expect(defined.has('text-renderer')).toBe(true);
    },
    testTimeout
  );
});
