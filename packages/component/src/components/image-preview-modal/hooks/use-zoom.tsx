import type { MouseEvent, RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';

interface UseZoomControlsProps {
  zoomRef: RefObject<HTMLDivElement>;
  imageRef: RefObject<HTMLImageElement>;
}

export const useZoomControls = ({
  zoomRef,
  imageRef,
}: UseZoomControlsProps) => {
  const [currentScale, setCurrentScale] = useState<number>(0.5);
  const [isZoomedBigger, setIsZoomedBigger] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [mouseX, setMouseX] = useState<number>(0);
  const [mouseY, setMouseY] = useState<number>(0);
  const [dragBeforeX, setDragBeforeX] = useState<number>(0);
  const [dragBeforeY, setDragBeforeY] = useState<number>(0);
  const [imagePos, setImagePos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const zoomIn = useCallback(() => {
    const image = imageRef.current;

    if (image && currentScale < 2) {
      const newScale = currentScale + 0.1;
      setCurrentScale(newScale);
      image.style.width = `${image.naturalWidth * newScale}px`;
      image.style.height = `${image.naturalHeight * newScale}px`;
    }
  }, [imageRef, currentScale]);

  const zoomOut = useCallback(() => {
    const image = imageRef.current;
    if (image && currentScale > 0.5) {
      const newScale = currentScale - 0.1;
      setCurrentScale(newScale);
      image.style.width = `${image.naturalWidth * newScale}px`;
      image.style.height = `${image.naturalHeight * newScale}px`;
      if (!isZoomedBigger) {
        image.style.transform = `translate(0px, 0px)`;
      }
    }
  }, [imageRef, currentScale, isZoomedBigger]);

  const resetZoom = () => {
    const image = imageRef.current;
    if (image) {
      setCurrentScale(1);
      image.style.width = `${image.naturalWidth}px`;
      image.style.height = `${image.naturalHeight}px`;
      if (!isZoomedBigger) {
        image.style.transform = 'translate(0, 0)';
      }
    }
  };

  const handleDragStart = (event: MouseEvent<HTMLImageElement>) => {
    event?.preventDefault();
    setIsDragging(true);
    const image = imageRef.current;
    if (image && isZoomedBigger) {
      image.style.cursor = 'grab';
      const rect = image.getBoundingClientRect();
      setDragBeforeX(rect.left);
      setDragBeforeY(rect.top);
      setMouseX(event.clientX);
      setMouseY(event.clientY);
    }
  };

  const handleDrag = (event: MouseEvent<HTMLImageElement>) => {
    event?.preventDefault();
    const image = imageRef.current;

    if (isDragging && image && isZoomedBigger) {
      image.style.cursor = 'grabbing';
      const currentX = imagePos.x;
      const currentY = imagePos.y;
      const newPosX = currentX + event.clientX - mouseX;
      const newPosY = currentY + event.clientY - mouseY;

      image.style.transform = `translate(${newPosX}px, ${newPosY}px)`;
    }
  };

  const handleDragEnd = (event: MouseEvent<HTMLImageElement> | undefined) => {
    event?.preventDefault();
    setIsDragging(false);

    const image = imageRef.current;
    if (image && isZoomedBigger) {
      image.style.cursor = 'pointer';
      const rect = image.getBoundingClientRect();
      const newPos = { x: rect.left, y: rect.top };
      const currentX = imagePos.x;
      const currentY = imagePos.y;
      const newPosX = currentX + newPos.x - dragBeforeX;
      const newPosY = currentY + newPos.y - dragBeforeY;
      setImagePos({ x: newPosX, y: newPosY });
    }
  };

  const handleMouseUp = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      if (isDragging) {
        handleDragEnd(event);
      }
    },
    [isDragging]
  );

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
  }, [zoomIn, zoomOut, checkZoomSize, handleMouseUp]);

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    isZoomedBigger,
    currentScale,
    handleDragStart,
    handleDrag,
    handleDragEnd,
  };
};
