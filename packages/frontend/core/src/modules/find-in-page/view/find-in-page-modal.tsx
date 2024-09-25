import { IconButton, observeResize, RowInput } from '@affine/component';
import {
  ArrowDownSmallIcon,
  ArrowUpSmallIcon,
  CloseIcon,
  SearchIcon,
} from '@blocksuite/icons/rc';
import * as Dialog from '@radix-ui/react-dialog';
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
import { useTransition } from 'react-transition-state';

import { FindInPageService } from '../services/find-in-page';
import * as styles from './find-in-page-modal.css';

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
  canvas.width = canvas.getBoundingClientRect().width * dpr;
  canvas.height = canvas.getBoundingClientRect().height * dpr;

  const rootStyles = getComputedStyle(document.documentElement);
  const textColor = rootStyles
    .getPropertyValue('--affine-text-primary-color')
    .trim();

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = textColor;
  ctx.font = '15px Inter';

  const offsetX = -scrollLeft; // Offset based on scrollLeft

  ctx.fillText(text, offsetX, 22);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
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

export const FindInPageModal = () => {
  const [value, setValue] = useState('');

  const findInPage = useService(FindInPageService).findInPage;
  const visible = useLiveData(findInPage.visible$);
  const result = useLiveData(findInPage.result$);
  const isSearching = useLiveData(findInPage.isSearching$);

  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [composing, setComposing] = useState(false);

  const [{ status }, toggle] = useTransition({
    timeout: animationTimeout,
  });

  useEffect(() => {
    toggle(visible);
  }, [visible]);

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
    if (visible) {
      setValue(findInPage.searchText$.value || '');
      const onEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          findInPage.onChangeVisible(false);
        }
      };
      window.addEventListener('keydown', onEsc);
      return () => {
        window.removeEventListener('keydown', onEsc);
      };
    }
    return () => {};
  }, [findInPage, findInPage.searchText$.value, visible]);

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
    <Dialog.Root open={status !== 'exited'}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.modalOverlay} />
        <div className={styles.modalContentWrapper}>
          <Dialog.Content
            style={assignInlineVars({
              [styles.animationTimeout]: `${animationTimeout}ms`,
            })}
            className={styles.modalContent}
            data-state={status}
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

            <div>
              <IconButton
                size="24"
                className={clsx(styles.arrowButton, 'backward')}
                onClick={handleBackWard}
                icon={<ArrowUpSmallIcon />}
              />
              <IconButton
                size="24"
                className={clsx(styles.arrowButton, 'forward')}
                onClick={handleForward}
                icon={<ArrowDownSmallIcon />}
              />
            </div>

            <IconButton onClick={handleDone} icon={<CloseIcon />} />
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
