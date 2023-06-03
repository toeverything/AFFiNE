import { useCallback, useEffect, useState } from 'react';

interface UseZoomControlsProps {
  zoomRef: React.RefObject<HTMLDivElement>;
}

export const useZoomControls = ({ zoomRef }: UseZoomControlsProps) => {
  const [currentScale, setCurrentScale] = useState<number>(1);
  const [isZoomedBigger, setIsZoomedBigger] = useState<boolean>(false);

  const zoomIn = () => {
    const { current: zoomArea } = zoomRef;
    if (zoomArea) {
      const image = zoomArea.querySelector('img');
      if (image && currentScale < 2) {
        setCurrentScale(prevScale => prevScale + 0.1);
        image.style.transform = `scale(${currentScale + 0.1})`;
      }
    }
  };

  const zoomOut = () => {
    const { current: zoomArea } = zoomRef;
    if (zoomArea) {
      const image = zoomArea.querySelector('img');
      if (image && currentScale > 0.5) {
        setCurrentScale(prevScale => prevScale - 0.1);
        image.style.transform = `scale(${currentScale - 0.1})`;
      }
    }
  };

  const resetZoom = () => {
    const { current: zoomArea } = zoomRef;
    if (zoomArea) {
      const image = zoomArea.querySelector('img');
      if (image) {
        setCurrentScale(1);
        image.style.transform = 'scale(1)';
      }
    }
  };

  const handleDragStart = (event: React.DragEvent<HTMLImageElement>) => {
    const { clientX, clientY } = event.touches ? event.touches[0] : event;
    event.dataTransfer.setDragImage(new Image(), 0, 0); // Hide the default drag image
    event.dataTransfer.setData('text/plain', ''); // Set some dummy data to enable dragging
    event.currentTarget.dataset.startX = String(clientX);
    event.currentTarget.dataset.startY = String(clientY);
  };

  const handleDrag = (event: React.DragEvent<HTMLImageElement>) => {
    event.preventDefault();
    const { clientX, clientY } = event.touches ? event.touches[0] : event;
    const startX = parseInt(event.currentTarget.dataset.startX || '0', 10);
    const startY = parseInt(event.currentTarget.dataset.startY || '0', 10);
    const deltaX = clientX - startX;
    const deltaY = clientY - startY;
    const { current: zoomArea } = zoomRef;
    if (zoomArea) {
      const image = zoomArea.querySelector('img');
      if (image) {
        image.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${currentScale})`;
      }
    }
  };

  const handleDragEnd = () => {
    const { current: zoomArea } = zoomRef;
    if (zoomArea) {
      const image = zoomArea.querySelector('img');
      if (image) {
        image.style.transform = `scale(${currentScale})`;
      }
    }
  };

  const checkZoomSize = useCallback(() => {
    const { current: zoomArea } = zoomRef;
    if (zoomArea) {
      const image = zoomArea.querySelector('img');
      if (image) {
        const zoomedWidth = image.naturalWidth * currentScale;
        const zoomedHeight = image.naturalHeight * currentScale;
        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;
        setIsZoomedBigger(
          zoomedWidth > containerWidth || zoomedHeight > containerHeight
        );
      }
    }
  }, [currentScale, zoomRef]);

  useEffect(() => {
    const handleScroll = (event: WheelEvent) => {
      const { deltaY } = event;
      if (deltaY > 0) {
        zoomOut();
      } else if (deltaY < 0) {
        zoomIn();
      }
    };

    const handleResize = () => {
      checkZoomSize();
    };

    checkZoomSize();

    window.addEventListener('wheel', handleScroll, { passive: false });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('wheel', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [zoomIn, zoomOut, checkZoomSize]);

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    isZoomedBigger,
    handleDragStart,
    handleDrag,
    handleDragEnd,
  };
};
