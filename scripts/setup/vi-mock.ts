import { vi } from 'vitest';

vi.mock('lottie-web', () => ({
  default: {},
}));

if (typeof window !== 'undefined' && HTMLCanvasElement) {
  // @ts-expect-error allow vitest global mock
  HTMLCanvasElement.prototype.getContext = () => {
    return {
      fillRect: vi.fn(),
    };
  };
}
