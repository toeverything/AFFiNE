import { debounce } from 'lodash-es';
import { useMemo, useState } from 'react';

export function useHasScrollTop() {
  const [hasScrollTop, setHasScrollTop] = useState(false);
  const containerRefFn = useMemo(() => {
    let unsub: (() => void) | null = null;
    return (container: HTMLElement | null) => {
      unsub?.();
      const updateScrollTop = debounce(() => {
        if (container) {
          setTimeout(() => {
            const hasScrollTop = container.scrollTop > 0;
            setHasScrollTop(hasScrollTop);
          });
        }
      }, 50);
      container?.addEventListener('scroll', updateScrollTop);
      updateScrollTop();
      unsub = () => {
        container?.removeEventListener('scroll', updateScrollTop);
      };
    };
  }, []);

  return [containerRefFn, hasScrollTop] as const;
}
