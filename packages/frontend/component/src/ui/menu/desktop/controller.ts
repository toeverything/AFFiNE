import { useCallback, useEffect, useRef, useState } from 'react';

export const useMenuContentController = ({
  onOpenChange,
  side,
  defaultOpen,
  sideOffset,
}: {
  defaultOpen?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  onOpenChange?: (open: boolean) => void;
  sideOffset?: number;
} = {}) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const contentSide = side ?? 'bottom';
  const [contentOffset, setContentOffset] = useState<number>(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange]
  );
  useEffect(() => {
    if (!open || !contentRef.current) return;

    const wrapperElement = contentRef.current.parentNode as HTMLDivElement;

    const updateContentOffset = () => {
      if (!contentRef.current) return;
      const contentRect = wrapperElement.getBoundingClientRect();
      if (contentSide === 'bottom') {
        setContentOffset(prev => {
          const viewportHeight = window.innerHeight;
          const newOffset = Math.min(
            viewportHeight - (contentRect.bottom - prev),
            0
          );
          return newOffset;
        });
      } else if (contentSide === 'top') {
        setContentOffset(prev => {
          const newOffset = Math.max(contentRect.top - prev, 0);
          return newOffset;
        });
      } else if (contentSide === 'left') {
        setContentOffset(prev => {
          const newOffset = Math.max(contentRect.left - prev, 0);
          return newOffset;
        });
      } else if (contentSide === 'right') {
        setContentOffset(prev => {
          const viewportWidth = window.innerWidth;
          const newOffset = Math.min(
            viewportWidth - (contentRect.right - prev),
            0
          );
          return newOffset;
        });
      }
    };
    let animationFrame: number = 0;
    const requestUpdateContentOffset = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(updateContentOffset);
    };

    const observer = new ResizeObserver(requestUpdateContentOffset);
    observer.observe(wrapperElement);
    window.addEventListener('resize', requestUpdateContentOffset);
    requestUpdateContentOffset();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', requestUpdateContentOffset);
      cancelAnimationFrame(animationFrame);
    };
  }, [contentSide, open]);

  return {
    handleOpenChange,
    contentSide,
    contentOffset: (sideOffset ?? 0) + contentOffset,
    contentRef,
  };
};
