import type { Collection } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import {
  EdgelessIcon,
  PageIcon,
  RemoveIcon,
  SaveIcon,
} from '@blocksuite/icons';
import { useCallback, useState } from 'react';

import {
  Button,
  Input,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  ScrollableContainer,
} from '../../..';
import { FilterList } from '../filter';
import * as styles from './collection-list.css';

type CreateCollectionProps = {
  title?: string;
  init: Collection;
  onConfirm: (collection: Collection) => void;
  onConfirmText?: string;
  getPageInfo: GetPageInfoById;
};
export const EditCollectionModel = ({
  init,
  onConfirm,
  open,
  onClose,
  getPageInfo,
}: {
  init?: Collection;
  onConfirm: (view: Collection) => void;
  open: boolean;
  onClose: () => void;
  getPageInfo: GetPageInfoById;
}) => {
  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper
        width={600}
        style={{
          padding: '40px',
          background: 'var(--affine-background-primary-color)',
        }}
      >
        <ModalCloseButton
          top={12}
          right={12}
          onClick={onClose}
          hoverColor="var(--affine-icon-color)"
        />
        {init ? (
          <EditCollection
            title="Update Collection"
            onConfirmText="Save"
            init={init}
            getPageInfo={getPageInfo}
            onCancel={onClose}
            onConfirm={view => {
              onConfirm(view);
              onClose();
            }}
          />
        ) : null}
      </ModalWrapper>
    </Modal>
  );
};

const Page = ({
  id,
  onClick,
  getPageInfo,
}: {
  id: string;
  onClick: (id: string) => void;
  getPageInfo: GetPageInfoById;
}) => {
  const page = getPageInfo(id);
  if (!page) {
    return null;
  }
  const icon = page.isEdgeless ? (
    <EdgelessIcon
      style={{
        width: 17.5,
        height: 17.5,
      }}
    />
  ) : (
    <PageIcon
      style={{
        width: 17.5,
        height: 17.5,
      }}
    />
  );
  const click = () => {
    onClick(id);
  };
  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageIcon}>{icon}</div>
      <div className={styles.pageTitle}>{page.title}</div>
      <div onClick={click} className={styles.deleteIcon}>
        <RemoveIcon />
      </div>
    </div>
  );
};
export const EditCollection = ({
  title,
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  getPageInfo,
}: CreateCollectionProps & {
  onCancel: () => void;
}) => {
  const [value, onChange] = useState<Collection>(init);
  const removeFromExcludeList = useCallback(
    (id: string) => {
      onChange({
        ...value,
        excludeList: value.excludeList?.filter(v => v !== id),
      });
    },
    [value]
  );
  const removeFromAllowList = useCallback(
    (id: string) => {
      onChange({
        ...value,
        allowList: value.allowList?.filter(v => v !== id),
      });
    },
    [value]
  );
  return (
    <div
      style={{
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className={styles.saveTitle}>
        {title ?? 'Save As New Collection'}
      </div>
      <ScrollableContainer
        className={styles.scrollContainer}
        viewPortClassName={styles.container}
      >
        {value.excludeList?.length ? (
          <div className={styles.excludeList}>
            <div className={styles.excludeTitle}>
              Exclude from this collection
            </div>
            <div className={styles.excludeListContent}>
              {value.excludeList.map(id => {
                return (
                  <Page
                    id={id}
                    getPageInfo={getPageInfo}
                    key={id}
                    onClick={removeFromExcludeList}
                  />
                );
              })}
            </div>
            <div className={styles.excludeTip}>
              These pages will never appear in the current collection
            </div>
          </div>
        ) : null}
        <div
          style={{
            backgroundColor: 'var(--affine-hover-color)',
            borderRadius: 8,
            padding: 18,
            marginTop: 20,
          }}
        >
          <div className={styles.filterTitle}>Filters</div>
          <FilterList
            value={value.filterList}
            onChange={list =>
              onChange({
                ...value,
                filterList: list,
              })
            }
          ></FilterList>
          {value.allowList ? (
            <div className={styles.allowList}>
              <div className={styles.allowTitle}>With follow pages:</div>
              <div className={styles.allowListContent}>
                {value.allowList.map(id => {
                  return (
                    <Page
                      key={id}
                      id={id}
                      getPageInfo={getPageInfo}
                      onClick={removeFromAllowList}
                    />
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ marginTop: 20 }}>
          <Input
            data-testid="input-collection-title"
            placeholder="Untitled Collection"
            value={value.name}
            onChange={text =>
              onChange({
                ...value,
                name: text,
              })
            }
          />
        </div>
      </ScrollableContainer>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: 40,
        }}
      >
        <Button className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          style={{
            marginLeft: 20,
            borderRadius: '8px',
          }}
          data-testid="save-collection"
          type="primary"
          onClick={() => {
            if (value.name.trim().length > 0) {
              onConfirm(value);
            }
          }}
        >
          {onConfirmText ?? 'Create'}
        </Button>
      </div>
    </div>
  );
};
export const SaveCollectionButton = ({
  init,
  onConfirm,
  getPageInfo,
}: CreateCollectionProps) => {
  const [show, changeShow] = useState(false);
  return (
    <>
      <Button
        className={styles.saveButton}
        onClick={() => changeShow(true)}
        size="middle"
        data-testid="save-as-collection"
      >
        <div className={styles.saveButtonContainer}>
          <div className={styles.saveIcon}>
            <SaveIcon />
          </div>
          <div className={styles.saveText}>Save As Collection</div>
        </div>
      </Button>
      <EditCollectionModel
        init={init}
        onConfirm={onConfirm}
        open={show}
        getPageInfo={getPageInfo}
        onClose={() => changeShow(false)}
      />
    </>
  );
};
