import { vi } from 'vitest';

// Refs: https://github.com/jsdom/jsdom/blob/master/lib/jsdom/living/custom-elements/CustomElementRegistry-impl.js
Object.defineProperty(window, 'customElements', {
  value: {
    define: vi.fn(),
    get: vi.fn(),
    whenDefined: vi.fn(),
    upgrade: vi.fn(),
  },
});
