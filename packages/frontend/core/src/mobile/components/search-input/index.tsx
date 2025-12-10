import { useAutoFocus } from '@affine/component';
import { getFigmaSquircleSvgPath } from '@blocksuite/affine/shared/utils';
import { SearchIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { debounce } from 'lodash-es';
import {
  type FormEventHandler,
  forwardRef,
  type HTMLProps,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as styles from './style.css';

export interface SearchInputProps extends Omit<
  HTMLProps<HTMLInputElement>,
  'onInput'
> {
  value?: string;
  height?: number;
  cornerRadius?: number;
  cornerSmoothing?: number;
  debounce?: number;
  onInput?: (value: string) => void;
}
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      className,
      style,
      placeholder = 'Search',
      value = '',
      height = 44,
      cornerRadius = 10,
      cornerSmoothing = 0.6,
      autoFocus,
      debounce: debounceDuration,
      onInput,
      onClick,
      ...attrs
    },
    upstreamRef
  ) {
    const focusRef = useAutoFocus<HTMLInputElement>(autoFocus);
    const containerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(window.innerWidth);
    const [inputValue, setInputValue] = useState(value);

    const clipPath = useMemo(
      () =>
        getFigmaSquircleSvgPath({
          width,
          height,
          cornerRadius,
          cornerSmoothing,
        }),
      [cornerRadius, cornerSmoothing, height, width]
    );

    useEffect(() => {
      setWidth(containerRef.current?.offsetWidth ?? 0);
    }, []);

    const emitValue = useMemo(() => {
      const cb = (value: string) => onInput?.(value);
      return debounceDuration ? debounce(cb, debounceDuration) : cb;
    }, [debounceDuration, onInput]);

    const handleInput: FormEventHandler<HTMLInputElement> = useCallback(
      e => {
        const value = e.currentTarget.value;
        setInputValue(value);
        emitValue(value);
      },
      [emitValue]
    );

    const inputRef = (el: HTMLInputElement | null) => {
      focusRef.current = el;
      if (upstreamRef) {
        if (typeof upstreamRef === 'function') {
          upstreamRef(el);
        } else {
          upstreamRef.current = el;
        }
      }
    };

    return (
      <div
        onClick={onClick}
        ref={containerRef}
        className={clsx(styles.wrapper, className)}
        style={{ ...style, height, clipPath: `path('${clipPath}')` }}
      >
        <div className={styles.prefixIcon}>
          <SearchIcon width="20" height="20" />
        </div>

        <input
          ref={inputRef}
          {...attrs}
          type="search"
          inputMode="search"
          value={inputValue}
          onInput={handleInput}
          className={styles.input}
        />

        {!inputValue ? (
          <div className={styles.placeholder}>{placeholder}</div>
        ) : null}
      </div>
    );
  }
);
