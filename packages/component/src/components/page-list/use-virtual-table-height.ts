import { useEffect, useState } from 'react';

export function useVirtualTableHeight() {
  const [virtualTableHeight, setVirtualTableHeight] = useState(0);
  useEffect(() => {
    const mainEl = document.querySelector('.main-container') as HTMLElement;
    const headEl = document.querySelector('.header-container') as HTMLElement;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0) return;
      for (const entry of entries) {
        if (entry.target !== mainEl && entry.target !== headEl) return;
      }
      const mainElHeight = mainEl.getBoundingClientRect().height;
      const headElHeight = headEl.getBoundingClientRect().height;
      const height = mainElHeight - headElHeight - 52;
      setVirtualTableHeight(height);
    });
    resizeObserver.observe(mainEl);
    resizeObserver.observe(headEl);
    return () => {
      resizeObserver.unobserve(mainEl);
      resizeObserver.unobserve(headEl);
    };
  }, []);

  return virtualTableHeight;
}
