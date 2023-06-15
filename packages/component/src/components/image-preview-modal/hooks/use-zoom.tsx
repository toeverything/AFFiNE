import type { MouseEvent as ReactMouseEvent, RefObject } from 'react';
import { useCallback, useEffect, useState } from 'react';

interface UseZoomControlsProps {
  zoomRef: RefObject<HTMLDivElement>;
  imageRef: RefObject<HTMLImageElement>;
}

export const useZoomControls = ({
  zoomRef,
  imageRef,
}: UseZoomControlsProps) => {
  const [currentScale, setCurrentScale] = useState<number>(1);
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
    if (image && currentScale > 0.2) {
      const newScale = currentScale - 0.1;
      setCurrentScale(newScale);
      image.style.width = `${image.naturalWidth * newScale}px`;
      image.style.height = `${image.naturalHeight * newScale}px`;
      const zoomedWidth = image.naturalWidth * newScale;
      const zoomedHeight = image.naturalHeight * newScale;
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      if (zoomedWidth > containerWidth || zoomedHeight > containerHeight) {
        image.style.transform = `translate(0px, 0px)`;
        setImagePos({ x: 0, y: 0 });
      }
    }
  }, [imageRef, currentScale]);

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

  const resetZoom = useCallback(() => {
    const image = imageRef.current;
    if (image) {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 0.2;

      const availableWidth = viewportWidth * (1 - margin);
      const availableHeight = viewportHeight * (1 - margin);

      const widthRatio = availableWidth / image.naturalWidth;
      const heightRatio = availableHeight / image.naturalHeight;

      const newScale = Math.min(widthRatio, heightRatio);
      setCurrentScale(newScale);
      image.style.width = `${image.naturalWidth * newScale}px`;
      image.style.height = `${image.naturalHeight * newScale}px`;
      image.style.transform = 'translate(0px, 0px)';
      setImagePos({ x: 0, y: 0 });
      checkZoomSize();
    }
  }, [checkZoomSize, imageRef]);

  const handleDragStart = useCallback(
    (event: ReactMouseEvent) => {
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
    },
    [imageRef, isZoomedBigger]
  );

  const handleDrag = useCallback(
    (event: ReactMouseEvent) => {
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
    },
    [
      imagePos.x,
      imagePos.y,
      imageRef,
      isDragging,
      isZoomedBigger,
      mouseX,
      mouseY,
    ]
  );

  const dragEndImpl = useCallback(() => {
    setIsDragging(false);

    const image = imageRef.current;
    if (image && isZoomedBigger && isDragging) {
      image.style.cursor = 'pointer';
      const rect = image.getBoundingClientRect();
      const newPos = { x: rect.left, y: rect.top };
      const currentX = imagePos.x;
      const currentY = imagePos.y;
      const newPosX = currentX + newPos.x - dragBeforeX;
      const newPosY = currentY + newPos.y - dragBeforeY;
      setImagePos({ x: newPosX, y: newPosY });
    }
  }, [
    dragBeforeX,
    dragBeforeY,
    imagePos.x,
    imagePos.y,
    imageRef,
    isDragging,
    isZoomedBigger,
  ]);

  const handleDragEnd = useCallback(
    (event: ReactMouseEvent) => {
      event.preventDefault();
      dragEndImpl();
    },
    [dragEndImpl]
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      dragEndImpl();
    }
  }, [isDragging, dragEndImpl]);

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
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('wheel', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mouseup', handleMouseUp);
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
