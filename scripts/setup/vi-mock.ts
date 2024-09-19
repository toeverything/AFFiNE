import { vi } from 'vitest';

vi.mock('lottie-web', () => ({
  default: {},
}));

vi.mock('@blocksuite/affine/presets', () => ({
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
}));

if (typeof window !== 'undefined' && HTMLCanvasElement) {
  // @ts-expect-error
  HTMLCanvasElement.prototype.getContext = () => {
    return {
      fillRect: vi.fn(),
    };
  };
}
