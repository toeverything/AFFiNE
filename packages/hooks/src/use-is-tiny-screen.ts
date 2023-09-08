import 'foxact/use-debounced-state';

import debounce from 'lodash.debounce';
import { type RefObject, useEffect, useState } from 'react';

export function useIsTinyScreen({
  mainContainer,
  leftStatic,
  leftSlot,
  centerDom,
  rightStatic,
  rightSlot,
}: {
  mainContainer: HTMLElement | null;
  leftStatic: RefObject<HTMLElement>;
  leftSlot: RefObject<HTMLElement>[];
  centerDom: RefObject<HTMLElement>;
  rightStatic: RefObject<HTMLElement>;
  rightSlot: RefObject<HTMLElement>[];
}) {
  const [isTinyScreen, setIsTinyScreen] = useState(false);

  useEffect(() => {
    if (!mainContainer) {
      return;
    }
    const handleResize = debounce(() => {
      if (!centerDom.current) {
        return;
      }
      const leftStaticWidth = leftStatic.current?.clientWidth || 0;
      const leftSlotWidth = leftSlot.reduce((accWidth, dom) => {
        return accWidth + (dom.current?.clientWidth || 0);
      }, 0);

      const rightStaticWidth = rightStatic.current?.clientWidth || 0;

      const rightSlotWidth = rightSlot.reduce((accWidth, dom) => {
        return accWidth + (dom.current?.clientWidth || 0);
      }, 0);

      if (!leftSlotWidth && !rightSlotWidth) {
        if (isTinyScreen) {
          setIsTinyScreen(false);
        }
        return;
      }

      const containerRect = mainContainer.getBoundingClientRect();
      const centerRect = centerDom.current.getBoundingClientRect();

      if (
        leftStaticWidth + leftSlotWidth + containerRect.left >=
          centerRect.left ||
        containerRect.right - centerRect.right <=
          rightSlotWidth + rightStaticWidth
      ) {
        setIsTinyScreen(true);
      } else {
        setIsTinyScreen(false);
      }
    }, 100);

    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(mainContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    centerDom,
    isTinyScreen,
    leftSlot,
    leftStatic,
    mainContainer,
    rightSlot,
    rightStatic,
  ]);

  return isTinyScreen;
}
