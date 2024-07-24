import { vi } from 'vitest';

vi.mock('lottie-web', () => ({
  default: {},
}));

vi.mock('@blocksuite/presets', () => ({
  AffineEditorContainer: vi.fn(),
  BiDirectionalLinkPanel: vi.fn(),
  DocMetaTags: vi.fn(),
  DocTitle: vi.fn(),
  EdgelessEditor: vi.fn(),
  PageEditor: vi.fn(),
  AIChatBlockSchema: {
    version: 1,
    model: {
      version: 1,
      flavour: 'affine:embed-ai-chat',
      role: 'content',
      children: [],
    },
  },
  AIChatBlockSpec: {},
  EdgelessAIChatBlockSpec: {},
}));

vi.mock('@blocksuite/presets/ai', () => ({
  AIProvider: {
    slots: new Proxy(
      {},
      {
        get: () => ({
          on: vi.fn(),
        }),
      }
    ),
    provide: vi.fn(),
  },
  AIEdgelessRootBlockSpec: {},
  AICodeBlockSpec: {},
  AIImageBlockSpec: {},
  AIParagraphBlockSpec: {},
  AIPageRootBlockSpec: {},
}));

if (typeof window !== 'undefined' && HTMLCanvasElement) {
  // @ts-expect-error
  HTMLCanvasElement.prototype.getContext = () => {
    return {
      fillRect: vi.fn(),
    };
  };
}
