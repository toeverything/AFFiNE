import type { Collection, Filter } from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  EdgelessIcon,
  PageIcon,
  RemoveIcon,
  SaveIcon,
} from '@blocksuite/icons';
import { uuidv4 } from '@blocksuite/store';
import { useCallback, useMemo, useState } from 'react';

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
  propertiesMeta: PropertiesMeta;
};

type SaveCollectionButtonProps = {
  onConfirm: (collection: Collection) => Promise<void>;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  filterList: Filter[];
  workspaceId: string;
};

export const EditCollectionModel = ({
  init,
  onConfirm,
  open,
  onClose,
  getPageInfo,
  propertiesMeta,
  title,
}: {
  init?: Collection;
  onConfirm: (view: Collection) => Promise<void>;
  open: boolean;
  onClose: () => void;
  title?: string;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
}) => {
  const t = useAFFiNEI18N();
  const onConfirmOnCollection = useCallback(
    (view: Collection) => {
      onConfirm(view)
        .then(() => {
          onClose();
        })
        .catch(err => {
          console.error(err);
        });
    },
    [onClose, onConfirm]
  );
  return (
    <Modal open={open} onClose={onClose}>
      <ModalWrapper
        width={600}
        style={{
          padding: '40px',
          background: 'var(--affine-background-primary-color)',
        }}
      >
        <ModalCloseButton top={12} right={12} onClick={onClose} />
        {init ? (
          <EditCollection
            propertiesMeta={propertiesMeta}
            title={title}
            onConfirmText={t['Save']()}
            init={init}
            getPageInfo={getPageInfo}
            onCancel={onClose}
            onConfirm={onConfirmOnCollection}
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
  propertiesMeta,
}: CreateCollectionProps & {
  onCancel: () => void;
}) => {
  const t = useAFFiNEI18N();
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
  const isNameEmpty = useMemo(() => value.name.trim().length === 0, [value]);
  const onSaveCollection = useCallback(() => {
    if (!isNameEmpty) {
      onConfirm(value);
    }
  }, [value, isNameEmpty, onConfirm]);
  return (
    <div
      style={{
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className={styles.saveTitle}>
        {title ?? t['Update Collection']()}
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
            minHeight: '200px',
          }}
        >
          <div className={styles.filterTitle}>Filters</div>
          <FilterList
            propertiesMeta={propertiesMeta}
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
            defaultValue={value.name}
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
        <Button size="large" onClick={onCancel}>
          {t['Cancel']()}
        </Button>
        <Button
          style={{
            marginLeft: 20,
          }}
          size="large"
          data-testid="save-collection"
          type="primary"
          disabled={isNameEmpty}
          onClick={onSaveCollection}
        >
          {onConfirmText ?? t['Create']()}
        </Button>
      </div>
    </div>
  );
};
export const SaveCollectionButton = ({
  onConfirm,
  getPageInfo,
  propertiesMeta,
  filterList,
  workspaceId,
}: SaveCollectionButtonProps) => {
  const [show, changeShow] = useState(false);
  const [init, setInit] = useState<Collection>();
  const handleClick = useCallback(() => {
    changeShow(true);
    setInit({
      id: uuidv4(),
      name: '',
      filterList,
      workspaceId,
    });
  }, [changeShow, workspaceId, filterList]);
  const t = useAFFiNEI18N();
  return (
    <>
      <Button
        onClick={handleClick}
        data-testid="save-as-collection"
        icon={<SaveIcon />}
        size="large"
        style={{ padding: '7px 8px' }}
      >
        Save As Collection
      </Button>
      <EditCollectionModel
        title={t['Save As New Collection']()}
        propertiesMeta={propertiesMeta}
        init={init}
        onConfirm={onConfirm}
        open={show}
        getPageInfo={getPageInfo}
        onClose={() => changeShow(false)}
      />
    </>
  );
};
