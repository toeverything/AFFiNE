import { useEffect, useRef, useState } from 'react';

export function useHasScrollTop() {
  const ref = useRef<HTMLDivElement>(null);
  const [hasScrollTop, setHasScrollTop] = useState(false);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const container = ref.current;

    function updateScrollTop() {
      if (container) {
        const hasScrollTop = container.scrollTop > 0;
        setHasScrollTop(hasScrollTop);
      }
    }

    container.addEventListener('scroll', updateScrollTop);
    updateScrollTop();
    return () => {
      container.removeEventListener('scroll', updateScrollTop);
    };
  }, []);

  return [hasScrollTop, ref] as const;
}
