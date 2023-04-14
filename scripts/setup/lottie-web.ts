import { vi } from 'vitest';

vi.mock('lottie-web', () => ({
  default: {},
}));

vi.mock('@blocksuite/editor', () => ({
  EditorContainer: vi.fn(),
}));

// @ts-expect-error
HTMLCanvasElement.prototype.getContext = () => {
  return {
    fillRect: vi.fn(),
  };
};
