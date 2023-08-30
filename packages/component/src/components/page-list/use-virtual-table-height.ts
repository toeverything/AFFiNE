import { useEffect, useState } from 'react';

export function useVirtualTableHeight(
  mainElement: HTMLElement | null,
  headerElement: HTMLElement | null
) {
  const [virtualTableHeight, setVirtualTableHeight] = useState(0);
  useEffect(() => {
    if (!mainElement || !headerElement) return;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0) return;
      for (const entry of entries) {
        if (entry.target !== mainElement && entry.target !== headerElement)
          return;
      }
      const mainElHeight = mainElement.getBoundingClientRect().height;
      const headElHeight = headerElement.getBoundingClientRect().height;
      const height = mainElHeight - headElHeight - 52;
      setVirtualTableHeight(height);
    });
    resizeObserver.observe(mainElement);
    resizeObserver.observe(headerElement);
    return () => {
      resizeObserver.unobserve(mainElement);
      resizeObserver.unobserve(headerElement);
    };
  }, [mainElement, headerElement]);

  return virtualTableHeight;
}
