import { useCallback, useState } from 'react';

import { useRefEffect } from '../../../hooks';

export const useMenuContentController = ({
  onOpenChange,
  side,
  defaultOpen,
  sideOffset,
  open: controlledOpen,
}: {
  defaultOpen?: boolean;
  side?: 'top' | 'bottom' | 'left' | 'right';
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  sideOffset?: number;
} = {}) => {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const actualOpen = controlledOpen ?? open;
  const contentSide = side ?? 'bottom';
  const [contentOffset, setContentOffset] = useState<number>(0);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange]
  );
  const contentRef = useRefEffect<HTMLDivElement>(
    contentElement => {
      if (!actualOpen) return;

      const wrapperElement = contentElement.parentNode as HTMLDivElement;

      const updateContentOffset = () => {
        if (!contentElement) return;
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
            const newOffset = Math.min(contentRect.top + prev, 0);
            return newOffset;
          });
        } else if (contentSide === 'left') {
          setContentOffset(prev => {
            const newOffset = Math.min(contentRect.left + prev, 0);
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
    },
    [actualOpen, contentSide]
  );

  return {
    handleOpenChange,
    contentSide,
    contentOffset: (sideOffset ?? 0) + contentOffset,
    contentRef,
    open: actualOpen,
  };
};
