import type {
  MouseEvent as ReactMouseEvent,
  RefObject,
  TouchEvent as ReactTouchEvent,
} from 'react';
import { useCallback, useEffect, useState } from 'react';

interface UseZoomControlsProps {
  zoomRef: RefObject<HTMLDivElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
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
  const [touchDistance, setTouchDistance] = useState<number | null>(null);
  const [touchScaleStart, setTouchScaleStart] = useState<number>(1);

  const applyScale = useCallback(
    (newScale: number) => {
      const image = imageRef.current;
      if (!image) {
        return;
      }
      const clampedScale = Math.max(0.2, Math.min(2, newScale));
      setCurrentScale(clampedScale);
      image.style.width = `${image.naturalWidth * clampedScale}px`;
      image.style.height = `${image.naturalHeight * clampedScale}px`;
    },
    [imageRef]
  );

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

  const handleMouseUp = useCallback(
    (evt: MouseEvent) => {
      evt.preventDefault();
      if (isDragging) {
        dragEndImpl();
      }
    },
    [isDragging, dragEndImpl]
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

  const zoomIn = useCallback(() => {
    if (currentScale < 2) {
      applyScale(currentScale + 0.1);
    }
  }, [applyScale, currentScale]);

  const zoomOut = useCallback(() => {
    const image = imageRef.current;
    if (image && currentScale > 0.2) {
      const newScale = currentScale - 0.1;
      applyScale(newScale);
      const zoomedWidth = image.naturalWidth * newScale;
      const zoomedHeight = image.naturalHeight * newScale;
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;
      if (zoomedWidth > containerWidth || zoomedHeight > containerHeight) {
        image.style.transform = `translate(0px, 0px)`;
        setImagePos({ x: 0, y: 0 });
      }
    }
  }, [applyScale, imageRef, currentScale]);

  const handleTouchStart = useCallback((event: ReactTouchEvent) => {
    if (event.touches.length !== 2) {
      return;
    }
    event.preventDefault();
    const [first, second] = event.touches;
    const distance = Math.hypot(
      second.clientX - first.clientX,
      second.clientY - first.clientY
    );
    setTouchDistance(distance);
    setTouchScaleStart(currentScale);
  }, [currentScale]);

  const handleTouchMove = useCallback(
    (event: ReactTouchEvent) => {
      if (event.touches.length !== 2 || !touchDistance) {
        return;
      }
      event.preventDefault();
      const [first, second] = event.touches;
      const distance = Math.hypot(
        second.clientX - first.clientX,
        second.clientY - first.clientY
      );
      applyScale(touchScaleStart * (distance / touchDistance));
    },
    [applyScale, touchDistance, touchScaleStart]
  );

  const handleTouchEnd = useCallback(() => {
    setTouchDistance(null);
  }, []);

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
  }, [imageRef, checkZoomSize]);

  const resetScale = useCallback(() => {
    const image = imageRef.current;
    if (image) {
      setCurrentScale(1);
      image.style.width = `${image.naturalWidth}px`;
      image.style.height = `${image.naturalHeight}px`;
      image.style.transform = 'translate(0px, 0px)';
      setImagePos({ x: 0, y: 0 });
    }
  }, [imageRef]);

  useEffect(() => {
    const handleScroll = (event: WheelEvent) => {
      event.preventDefault();
      const { deltaY } = event;
      if (deltaY > 0) {
        zoomOut();
      } else if (deltaY < 0 && currentScale < 2) {
        zoomIn();
      }
    };

    const handleResize = (event: UIEvent) => {
      event.preventDefault();
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
  }, [zoomIn, zoomOut, checkZoomSize, handleMouseUp, currentScale]);

  return {
    zoomIn,
    zoomOut,
    resetZoom,
    resetScale,
    isZoomedBigger,
    currentScale,
    handleDragStart,
    handleDrag,
    handleDragEnd,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};
