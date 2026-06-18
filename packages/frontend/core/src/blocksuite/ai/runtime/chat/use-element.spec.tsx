/**
 * @vitest-environment happy-dom
 */
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { useAIChatElement } from './use-element';

class TestAIChatElement extends HTMLElement {
  accessor value = '';
}

if (!customElements.get('test-ai-chat-element')) {
  customElements.define('test-ai-chat-element', TestAIChatElement);
}

function createContainerRef() {
  const container = document.createElement('div');
  document.body.append(container);
  return { current: container };
}

function createElement() {
  return document.createElement('test-ai-chat-element') as TestAIChatElement;
}

describe('useAIChatElement', () => {
  test('creates one element and keeps its properties in sync', async () => {
    const containerRef = createContainerRef();

    const { rerender, result } = renderHook(
      ({ value }) =>
        useAIChatElement({
          containerRef,
          selector: 'test-ai-chat-element',
          enabled: true,
          createElement,
          configureElement: element => {
            element.value = value;
          },
        }),
      { initialProps: { value: 'first' } }
    );

    await waitFor(() => {
      expect(
        containerRef.current.querySelectorAll('test-ai-chat-element')
      ).toHaveLength(1);
      expect(result.current?.value).toBe('first');
    });

    rerender({ value: 'next' });

    await waitFor(() => {
      expect(
        containerRef.current.querySelectorAll('test-ai-chat-element')
      ).toHaveLength(1);
      expect(result.current?.value).toBe('next');
    });
  });

  test('reuses an existing element and removes duplicates', async () => {
    const containerRef = createContainerRef();
    const first = createElement();
    const duplicate = createElement();
    containerRef.current.append(first, duplicate);
    const createElementSpy = vi.fn(createElement);

    const { result } = renderHook(() =>
      useAIChatElement({
        containerRef,
        selector: 'test-ai-chat-element',
        enabled: true,
        createElement: createElementSpy,
        configureElement: element => {
          element.value = 'reused';
        },
      })
    );

    await waitFor(() => {
      expect(
        containerRef.current.querySelectorAll('test-ai-chat-element')
      ).toHaveLength(1);
      expect(result.current).toBe(first);
      expect(first.value).toBe('reused');
    });
    expect(createElementSpy).not.toHaveBeenCalled();
  });
});
