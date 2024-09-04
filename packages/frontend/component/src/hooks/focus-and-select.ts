import { useLayoutEffect, useRef } from 'react';

export const useAutoFocus = <T extends HTMLElement = HTMLElement>(
  autoFocus?: boolean
) => {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    if (ref.current && autoFocus) {
      // to avoid clicking on something focusable(e.g MenuItem),
      // then the input will not be focused
      setTimeout(() => {
        ref.current?.focus();
      }, 0);
    }
  }, [autoFocus]);

  return ref;
};

export const useAutoSelect = <T extends HTMLInputElement = HTMLInputElement>(
  autoSelect?: boolean
) => {
  const ref = useAutoFocus<T>(autoSelect);

  useLayoutEffect(() => {
    if (ref.current && autoSelect) {
      setTimeout(() => {
        ref.current?.select();
      }, 0);
    }
  }, [autoSelect, ref]);

  return ref;
};
