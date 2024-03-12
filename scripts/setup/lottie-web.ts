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
}));

if (typeof window !== 'undefined' && HTMLCanvasElement) {
  // @ts-expect-error
  HTMLCanvasElement.prototype.getContext = () => {
    return {
      fillRect: vi.fn(),
    };
  };
}
