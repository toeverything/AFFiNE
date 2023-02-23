import { styled } from '@affine/component';
import React, { useEffect, useRef } from 'react';
const StyledDragLine = styled.div(({ theme }) => {
  return {
    width: '5px',
    height: '100%',
    position: 'absolute',
    top: '0',
    right: '-10px',
    cursor: 'col-resize',
  };
});

export type DragLineProps = {
  onDrag?: (params: { movementX: number; movementY: number }) => void;
  initialPosition?: { x: number; y: number };
  leftOffset?: number;
  rightOffset?: number;
};

export const DragLine = ({
  onDrag,
  leftOffset,
  rightOffset,
  initialPosition,
}: DragLineProps) => {
  const isDragging = useRef(false);
  const lineRef = useRef<HTMLDivElement>(null);
  const recordPosition = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;

      const movementX = e.clientX - recordPosition.current.x;
      const movementY = e.clientY - recordPosition.current.y;

      if (
        (rightOffset !== undefined &&
          initialPosition &&
          initialPosition.x + rightOffset < recordPosition.current.x) ||
        (leftOffset !== undefined &&
          initialPosition &&
          recordPosition.current.x - initialPosition.x < leftOffset)
      ) {
        recordPosition.current.x = e.clientX;
        recordPosition.current.y = e.clientY;
        document.body.style.cursor = 'not-allowed';

        return;
      }
      document.body.style.cursor = 'col-resize';

      onDrag?.({ movementX, movementY });
      recordPosition.current.x = e.clientX;
      recordPosition.current.y = e.clientY;
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [initialPosition, leftOffset, onDrag, rightOffset]);
  return (
    <StyledDragLine
      ref={lineRef}
      //The mouse event is used instead of the drag event because the drag event triggers the drag image display
      onMouseDown={e => {
        e.preventDefault();
        isDragging.current = true;
        const position = lineRef.current?.getBoundingClientRect();
        recordPosition.current = {
          x: position?.x || 0,
          y: position?.y || 0,
        };
      }}
      onMouseUp={() => {
        isDragging.current = false;

        console.log('onMouseUp');
      }}
    ></StyledDragLine>
  );
};

export default DragLine;
