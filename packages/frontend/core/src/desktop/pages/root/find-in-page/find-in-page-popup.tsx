import { IconButton, observeResize, RowInput } from '@affine/component';
import { FindInPageService } from '@affine/core/modules/find-in-page';
import {
  ArrowDownSmallIcon,
  ArrowUpSmallIcon,
  CloseIcon,
  SearchIcon,
} from '@blocksuite/icons/rc';
import * as Popover from '@radix-ui/react-popover';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import {
  type CompositionEventHandler,
  type KeyboardEventHandler,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTransitionState } from 'react-transition-state';

import * as styles from './find-in-page-popup.css';

const animationTimeout = 120;

const drawText = (
  canvas: HTMLCanvasElement,
  text: string,
  scrollLeft: number
) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  // the container will be animated,
  // so we need to use clientWidth and clientHeight instead of getBoundingClientRect
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;

  const rootStyles = getComputedStyle(document.documentElement);
  const textColor = rootStyles
    .getPropertyValue('--affine-text-primary-color')
    .trim();

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const offsetX = -scrollLeft;
  ctx.fillStyle = textColor;
  ctx.font = '15px Inter';
  ctx.letterSpacing = '0.01em';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, offsetX, 22);
};

const CanvasText = ({
  text,
  scrollLeft,
  className,
}: {
  text: string;
  scrollLeft: number;
  className: string;
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    drawText(canvas, text, scrollLeft);
    return observeResize(canvas, () => drawText(canvas, text, scrollLeft));
  }, [text, scrollLeft]);

  return <canvas className={className} ref={ref} />;
};

export const FindInPagePopup = () => {
  const [value, setValue] = useState('');

  const findInPage = useService(FindInPageService).findInPage;
  const visible = useLiveData(findInPage.visible$);
  const result = useLiveData(findInPage.result$);
  const isSearching = useLiveData(findInPage.isSearching$);

  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [composing, setComposing] = useState(false);

  const [{ status }, toggle] = useTransitionState({
    timeout: animationTimeout,
  });

  useEffect(() => {
    toggle(visible);
    setValue(findInPage.searchText$.value || '');
  }, [findInPage.searchText$.value, toggle, visible]);

  const handleValueChange = useCallback(
    (value: string) => {
      setValue(value);
      if (!composing) {
        findInPage.findInPage(value);
      }
      if (value.length === 0) {
        findInPage.clear();
      }
      inputRef.current?.focus();
    },
    [composing, findInPage]
  );

  const handleFocus = useCallback(() => {
    setActive(true);
  }, []);

  const handleBlur = useCallback(() => {
    setActive(false);
  }, []);

  useEffect(() => {
    const unsub = findInPage.isSearching$.subscribe(() => {
      inputRef.current?.focus();
      setTimeout(() => {
        inputRef.current?.focus();
      });
    });

    return () => {
      unsub.unsubscribe();
    };
  }, [findInPage.isSearching$]);

  const handleBackWard = useCallback(() => {
    findInPage.backward();
  }, [findInPage]);

  const handleForward = useCallback(() => {
    findInPage.forward();
  }, [findInPage]);

  const onChangeVisible = useCallback(
    (visible: boolean) => {
      if (!visible) {
        findInPage.clear();
      }
      findInPage.onChangeVisible(visible);
    },
    [findInPage]
  );

  const handleDone = useCallback(() => {
    onChangeVisible(false);
  }, [onChangeVisible]);

  const handleKeydown: KeyboardEventHandler = useCallback(
    e => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        handleForward();
      }
      if (e.key === 'ArrowUp') {
        handleBackWard();
      }
    },
    [handleBackWard, handleForward]
  );

  const handleScroll = useCallback(
    (e: { currentTarget: { scrollLeft: SetStateAction<number> } }) => {
      setScrollLeft(e.currentTarget.scrollLeft);
    },
    []
  );

  const handleCompositionStart: CompositionEventHandler<HTMLInputElement> =
    useCallback(() => {
      setComposing(true);
    }, []);

  const handleCompositionEnd: CompositionEventHandler<HTMLInputElement> =
    useCallback(
      e => {
        setComposing(false);
        findInPage.findInPage(e.currentTarget.value);
      },
      [findInPage]
    );

  return (
    <Popover.Root open={status !== 'exited'} onOpenChange={onChangeVisible}>
      <Popover.Anchor className={styles.anchor} data-find-in-page-anchor />
      <Popover.Portal>
        <Popover.Content
          style={assignInlineVars({
            [styles.animationTimeout]: `${animationTimeout}ms`,
          })}
          className={styles.contentContainer}
          data-state={status}
          sideOffset={5}
          side="left"
          onInteractOutside={e => {
            // do not close the popup when focus outside (like focus in the editor)
            e.preventDefault();
          }}
        >
          <div
            className={clsx(styles.inputContainer, {
              active: active || isSearching,
            })}
          >
            <SearchIcon className={styles.searchIcon} />
            <div className={styles.inputMain}>
              <RowInput
                type="text"
                autoFocus
                value={value}
                ref={inputRef}
                style={{
                  visibility: isSearching ? 'hidden' : 'visible',
                }}
                onBlur={handleBlur}
                onFocus={handleFocus}
                className={styles.input}
                onKeyDown={handleKeydown}
                onChange={handleValueChange}
                onScroll={handleScroll}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
              <CanvasText
                className={styles.inputHack}
                text={value}
                scrollLeft={scrollLeft}
              />
            </div>
            <div className={styles.count}>
              {value.length > 0 && result && result.matches !== 0 ? (
                <>
                  <span>{result?.activeMatchOrdinal || 0}</span>
                  <span>/</span>
                  <span>{result?.matches || 0}</span>
                </>
              ) : value.length ? (
                <span>No matches</span>
              ) : null}
            </div>
          </div>

          <div className={styles.arrowButtonContainer}>
            <IconButton
              size="24"
              className={styles.arrowButton}
              onClick={handleBackWard}
              icon={<ArrowUpSmallIcon />}
            />
            <IconButton
              size="24"
              className={styles.arrowButton}
              onClick={handleForward}
              icon={<ArrowDownSmallIcon />}
            />
          </div>

          <IconButton onClick={handleDone} icon={<CloseIcon />} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
