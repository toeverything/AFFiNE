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
import { Button } from '@toeverything/components/button';
import { useCallback, useMemo, useState } from 'react';

import {
  Input,
  Modal,
  ModalCloseButton,
  ModalWrapper,
  ScrollableContainer,
} from '../../..';
import { FilterList } from '../filter';
import * as styles from './collection-list.css';

interface EditCollectionModelProps {
  init?: Collection;
  title?: string;
  open: boolean;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  onClose: () => void;
  onConfirm: (view: Collection) => Promise<void>;
}

export const EditCollectionModel = ({
  init,
  onConfirm,
  open,
  onClose,
  getPageInfo,
  propertiesMeta,
  title,
}: EditCollectionModelProps) => {
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

interface PageProps {
  id: string;
  getPageInfo: GetPageInfoById;
  onClick: (id: string) => void;
}

const Page = ({ id, onClick, getPageInfo }: PageProps) => {
  const page = getPageInfo(id);
  const handleClick = useCallback(() => onClick(id), [id, onClick]);
  return (
    <>
      {page ? (
        <div className={styles.pageContainer}>
          <div className={styles.pageIcon}>
            {page.isEdgeless ? (
              <EdgelessIcon style={{ width: 17.5, height: 17.5 }} />
            ) : (
              <PageIcon style={{ width: 17.5, height: 17.5 }} />
            )}
          </div>
          <div className={styles.pageTitle}>{page.title}</div>
          <div onClick={handleClick} className={styles.deleteIcon}>
            <RemoveIcon />
          </div>
        </div>
      ) : null}
    </>
  );
};

interface EditCollectionProps {
  title?: string;
  onConfirmText?: string;
  init: Collection;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  onCancel: () => void;
  onConfirm: (collection: Collection) => void;
}

export const EditCollection = ({
  title,
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  getPageInfo,
  propertiesMeta,
}: EditCollectionProps) => {
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
          <div className={styles.filterTitle}>{t['Filters']()}</div>
          <FilterList
            propertiesMeta={propertiesMeta}
            value={value.filterList}
            onChange={filterList => onChange({ ...value, filterList })}
          />
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
            placeholder={t['Untitled Collection']()}
            defaultValue={value.name}
            onChange={name => onChange({ ...value, name })}
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

interface SaveCollectionButtonProps {
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  filterList: Filter[];
  workspaceId: string;
  onConfirm: (collection: Collection) => Promise<void>;
}

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
        {t['Save As New Collection']()}
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
