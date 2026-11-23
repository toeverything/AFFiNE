import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';

export type UseAIChatElementOptions<T extends HTMLElement> = {
  containerRef: RefObject<HTMLElement | null>;
  selector: string;
  enabled: boolean;
  createElement: () => T;
  configureElement: (element: T) => void;
  onElementReady?: (element: T) => void;
};

export function useAIChatElement<T extends HTMLElement>({
  containerRef,
  selector,
  enabled,
  createElement,
  configureElement,
  onElementReady,
}: UseAIChatElementOptions<T>) {
  const [element, setElement] = useState<T | null>(null);
  const readyElementsRef = useRef(new WeakSet<T>());

  useEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container) return;

    const existingElements = Array.from(
      container.querySelectorAll(selector)
    ) as T[];
    const nextElement = element ?? existingElements[0] ?? createElement();

    existingElements
      .filter(existingElement => existingElement !== nextElement)
      .forEach(existingElement => existingElement.remove());

    configureElement(nextElement);

    if (nextElement.parentElement !== container) {
      container.append(nextElement);
    }

    if (!readyElementsRef.current.has(nextElement)) {
      readyElementsRef.current.add(nextElement);
      onElementReady?.(nextElement);
    }

    if (element !== nextElement) {
      setElement(nextElement);
    }
  }, [
    configureElement,
    containerRef,
    createElement,
    element,
    enabled,
    onElementReady,
    selector,
  ]);

  return element;
}
