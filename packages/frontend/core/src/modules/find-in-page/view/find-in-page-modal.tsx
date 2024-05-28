import { Button, Input, Modal } from '@affine/component';
import { rightSidebarWidthAtom } from '@affine/core/atoms';
import {
  ArrowDownSmallIcon,
  ArrowUpSmallIcon,
  SearchIcon,
} from '@blocksuite/icons';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useDebouncedValue } from 'foxact/use-debounced-value';
import { useAtomValue } from 'jotai';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';

import { RightSidebarService } from '../../right-sidebar';
import { FindInPageService } from '../services/find-in-page';
import * as styles from './find-in-page-modal.css';
export const FindInPageModal = () => {
  const [value, setValue] = useState('');
  const debouncedValue = useDebouncedValue(value, 300);
  const deferredValue = useDeferredValue(debouncedValue);

  const findInPage = useService(FindInPageService).findInPage;
  const visible = useLiveData(findInPage.visible$);
  const result = useLiveData(findInPage.result$);
  const isSearching = useLiveData(findInPage.isSearching$);

  const rightSidebarWidth = useAtomValue(rightSidebarWidthAtom);
  const rightSidebar = useService(RightSidebarService).rightSidebar;
  const frontView = useLiveData(rightSidebar.front$);
  const open = useLiveData(rightSidebar.isOpen$) && frontView !== undefined;

  const handleSearch = useCallback(() => {
    findInPage.findInPage(deferredValue);
  }, [deferredValue, findInPage]);

  const handleBackWard = useCallback(() => {
    findInPage.backward();
  }, [findInPage]);

  const handleForward = useCallback(() => {
    findInPage.forward();
  }, [findInPage]);

  const onChangeVisible = useCallback(
    (visible: boolean) => {
      if (!visible) {
        findInPage.stopFindInPage('clearSelection');
      }
      findInPage.onChangeVisible(visible);
    },
    [findInPage]
  );
  const handleDone = useCallback(() => {
    onChangeVisible(false);
  }, [onChangeVisible]);

  useEffect(() => {
    // add keyboard event listener for arrow up and down
    const keyArrowDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        handleForward();
      }
    };
    const keyArrowUp = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp') {
        handleBackWard();
      }
    };
    document.addEventListener('keydown', keyArrowDown);
    document.addEventListener('keydown', keyArrowUp);
    return () => {
      document.removeEventListener('keydown', keyArrowDown);
      document.removeEventListener('keydown', keyArrowUp);
    };
  }, [findInPage, handleBackWard, handleForward]);

  const panelWidth = assignInlineVars({
    [styles.panelWidthVar]: open ? `${rightSidebarWidth}px` : '0',
  });

  useEffect(() => {
    // auto search when value change
    if (deferredValue) {
      handleSearch();
    }
  }, [deferredValue, handleSearch]);

  useEffect(() => {
    // clear highlight when value is empty
    if (value.length === 0) {
      findInPage.stopFindInPage('keepSelection');
    }
  }, [value, findInPage]);

  return (
    <Modal
      open={visible}
      onOpenChange={onChangeVisible}
      overlayOptions={{
        hidden: true,
      }}
      withoutCloseButton
      width={398}
      height={48}
      minHeight={48}
      contentOptions={{
        className: styles.container,
        style: panelWidth,
      }}
    >
      <div className={styles.leftContent}>
        <Input
          onChange={setValue}
          value={isSearching ? '' : value}
          onEnter={handleSearch}
          autoFocus
          preFix={<SearchIcon fontSize={20} />}
          endFix={
            <div className={styles.count}>
              {value.length > 0 && result && result.matches !== 0 ? (
                <>
                  <span>{result?.activeMatchOrdinal || 0}</span>
                  <span>/</span>
                  <span>{result?.matches || 0}</span>
                </>
              ) : (
                <span>No matches</span>
              )}
            </div>
          }
          style={{
            width: 239,
          }}
          className={styles.input}
          inputStyle={{
            padding: '0',
          }}
        />

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
