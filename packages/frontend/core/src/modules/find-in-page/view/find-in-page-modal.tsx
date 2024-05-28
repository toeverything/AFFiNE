import { Button, Modal } from '@affine/component';
import { rightSidebarWidthAtom } from '@affine/core/atoms';
import { ArrowDownSmallIcon, ArrowUpSmallIcon } from '@blocksuite/icons';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useAtomValue } from 'jotai';
import {
  type KeyboardEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { RightSidebarService } from '../../right-sidebar';
import { FindInPageService } from '../services/find-in-page';
import * as styles from './find-in-page-modal.css';

const drawText = (canvas: HTMLCanvasElement, text: string) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.getBoundingClientRect().width * dpr;
  canvas.height = canvas.getBoundingClientRect().height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '15px Inter';
  ctx.fillText(text, 0, 22);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'ideographic';
};

const CanvasText = ({
  text,
  className,
}: {
  text: string;
  className: string;
}) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    drawText(canvas, text);
    const resizeObserver = new ResizeObserver(() => {
      drawText(canvas, text);
    });
    resizeObserver.observe(canvas);
    return () => {
      resizeObserver.disconnect();
    };
  }, [text]);

  return <canvas className={className} ref={ref} />;
};

export const FindInPageModal = () => {
  const [value, setValue] = useState('');

  const findInPage = useService(FindInPageService).findInPage;
  const visible = useLiveData(findInPage.visible$);
  const result = useLiveData(findInPage.result$);
  const isSearching = useLiveData(findInPage.isSearching$);

  const rightSidebarWidth = useAtomValue(rightSidebarWidthAtom);
  const rightSidebar = useService(RightSidebarService).rightSidebar;
  const frontView = useLiveData(rightSidebar.front$);
  const open = useLiveData(rightSidebar.isOpen$) && frontView !== undefined;
  const inputRef = useRef<HTMLInputElement>(null);

  const handleValueChange = useCallback(
    (v: string) => {
      setValue(v);
      findInPage.findInPage(v);
      if (v.length === 0) {
        findInPage.clear();
      }
      inputRef.current?.focus();
    },
    [findInPage]
  );

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
  const panelWidth = assignInlineVars({
    [styles.panelWidthVar]: open ? `${rightSidebarWidth}px` : '0',
  });

  return (
    <Modal
      open={visible}
      modal={false}
      withoutCloseButton
      width={400}
      height={48}
      minHeight={48}
      contentOptions={{
        className: styles.container,
        style: panelWidth,
      }}
    >
      <div className={styles.leftContent}>
        <div className={styles.inputContainer}>
          <input
            type="text"
            autoFocus
            value={value}
            ref={inputRef}
            style={{
              visibility: isSearching ? 'hidden' : 'visible',
            }}
            className={styles.input}
            onKeyDown={handleKeydown}
            onChange={e => handleValueChange(e.target.value)}
          />
          <CanvasText className={styles.inputHack} text={value} />
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

        <Button
          className={clsx(styles.arrowButton, 'backward')}
          onClick={handleBackWard}
        >
          <ArrowUpSmallIcon />
        </Button>
        <Button
          className={clsx(styles.arrowButton, 'forward')}
          onClick={handleForward}
        >
          <ArrowDownSmallIcon />
        </Button>
      </div>
      <Button type="primary" onClick={handleDone}>
        Done
      </Button>
    </Modal>
  );
};
