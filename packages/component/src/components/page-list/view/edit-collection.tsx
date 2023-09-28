import {
  CreateCollectionModal,
  createEmptyCollection,
} from '@affine/component/page-list';
import type { Collection, Filter, PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilterIcon, SaveIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Modal } from '@toeverything/components/modal';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import { useCallback, useMemo, useState } from 'react';

import { RadioButton, RadioButtonGroup } from '../../..';
import { FilterList } from '../filter';
import * as styles from './edit-collection.css';

export interface EditCollectionModalProps {
  init?: Collection;
  title?: string;
  open: boolean;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  onOpenChange: (open: boolean) => void;
  onConfirm: (view: Collection) => Promise<void>;
}

export const EditCollectionModal = ({
  init,
  onConfirm,
  open,
  onOpenChange,
  getPageInfo,
  propertiesMeta,
  title,
}: EditCollectionModalProps) => {
  const t = useAFFiNEI18N();
  const onConfirmOnCollection = useCallback(
    (view: Collection) => {
      onConfirm(view)
        .then(() => {
          onOpenChange(false);
        })
        .catch(err => {
          console.error(err);
        });
    },
    [onConfirm, onOpenChange]
  );
  const onCancel = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      withoutCloseButton
      width={944}
      contentOptions={{ style: { padding: 0 } }}
    >
      {init ? (
        <EditCollection
          propertiesMeta={propertiesMeta}
          title={title}
          onConfirmText={t['com.affine.editCollection.save']()}
          init={init}
          getPageInfo={getPageInfo}
          onCancel={onCancel}
          onConfirm={onConfirmOnCollection}
        />
      ) : null}
    </Modal>
  );
};

// interface PageProps {
//   id: string;
//   getPageInfo: GetPageInfoById;
//   onClick: (id: string) => void;
// }

// const Page = ({ id, onClick, getPageInfo }: PageProps) => {
//   const page = getPageInfo(id);
//   const handleClick = useCallback(() => onClick(id), [id, onClick]);
//   return (
//     <>
//       {page ? (
//         <div className={styles.pageContainer}>
//           <div className={styles.pageIcon}>
//             {page.isEdgeless ? (
//               <EdgelessIcon style={{ width: 17.5, height: 17.5 }} />
//             ) : (
//               <PageIcon style={{ width: 17.5, height: 17.5 }} />
//             )}
//           </div>
//           <div className={styles.pageTitle}>{page.title}</div>
//           <div onClick={handleClick} className={styles.deleteIcon}>
//             <RemoveIcon />
//           </div>
//         </div>
//       ) : null}
//     </>
//   );
// };

export interface EditCollectionProps {
  title?: string;
  onConfirmText?: string;
  init: Collection;
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  onCancel: () => void;
  onConfirm: (collection: Collection) => void;
}

export const EditCollection = ({
  init,
  onConfirm,
  onCancel,
  onConfirmText,
  propertiesMeta,
}: EditCollectionProps) => {
  const t = useAFFiNEI18N();
  const [value, onChange] = useState<Collection>(init);
  const [showPreview, setShowPreview] = useState(true);
  // const removeFromAllowList = useCallback(
  //   (id: string) => {
  //     onChange({
  //       ...value,
  //       allowList: value.allowList?.filter(v => v !== id),
  //     });
  //   },
  //   [value]
  // );
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
      <div className={styles.rulesTitle}>
        Pages that meet the rules will be added to the current collection{' '}
        <span className={styles.rulesTitleHighlight}>automatically</span>.
      </div>
      <div style={{ display: 'flex' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              alignItems: 'center',
              padding: '16px 16px 8px 16px',
            }}
          >
            <RadioButtonGroup
              width={158}
              style={{ height: 32 }}
              value={value.mode}
              onValueChange={useCallback((mode: 'page' | 'rule') => {
                onChange({
                  ...value,
                  mode,
                });
              }, [])}
            >
              <RadioButton
                spanStyle={styles.tabButton}
                value="page"
                data-testid="edit-collection-pages-button"
              >
                {t['com.affine.editCollection.pages']()}
              </RadioButton>
              <RadioButton
                spanStyle={styles.tabButton}
                value="rule"
                data-testid="edit-collection-rules-button"
              >
                {t['com.affine.editCollection.rules']()}
              </RadioButton>
            </RadioButtonGroup>
            <FilterIcon
              className={clsx(styles.icon, styles.button)}
              width={24}
              height={24}
            ></FilterIcon>
          </div>
          <div style={{ padding: '12px 16px 16px' }}>
            <FilterList
              propertiesMeta={propertiesMeta}
              value={value.filterList}
              onChange={filterList => onChange({ ...value, filterList })}
            />
          </div>
        </div>
        <div style={{ flex: 2, display: showPreview ? 'flex' : 'none' }}>
          list
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderTop: '1px solid var(--affine-border-color)',
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div
            className={clsx(
              styles.button,
              styles.bottomButton,
              showPreview && styles.previewActive
            )}
            onClick={() => {
              setShowPreview(!showPreview);
            }}
          >
            Preview
          </div>
          <div
            className={clsx(styles.button, styles.bottomButton)}
            onClick={() => {
              onChange(init);
            }}
          >
            Reset
          </div>
          <div className={styles.previewCountTips}>
            After searching, there are currently{' '}
            <span className={styles.previewCountTipsHighlight}>13</span> pages.
          </div>
        </div>
        <div>
          <Button size="large" onClick={onCancel}>
            {t['com.affine.editCollection.button.cancel']()}
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
            {onConfirmText ?? t['com.affine.editCollection.button.create']()}
          </Button>
        </div>
      </div>
    </div>
  );
};

interface EditCollectionButtonProps {
  filterList: Filter[];
  workspaceId: string;
  onConfirm: (collection: Collection) => Promise<void>;
}

export const EditCollectionButton = ({
  onConfirm,
  filterList,
  workspaceId,
}: EditCollectionButtonProps) => {
  const [show, changeShow] = useState(false);
  const handleClick = useCallback(() => {
    changeShow(true);
  }, [changeShow, workspaceId, filterList]);
  const t = useAFFiNEI18N();
  const createCollection = useCallback(
    (title: string) => {
      return onConfirm(createEmptyCollection(nanoid(), { name: title }));
    },
    [onConfirm]
  );
  return (
    <>
      <Button
        onClick={handleClick}
        data-testid="save-as-collection"
        icon={<SaveIcon />}
        size="large"
        style={{ padding: '7px 8px' }}
      >
        {t['com.affine.editCollection.saveCollection']()}
      </Button>
      <CreateCollectionModal
        title={t['com.affine.editCollection.saveCollection']()}
        init=""
        onConfirm={createCollection}
        open={show}
        onOpenChange={changeShow}
      />
    </>
  );
};
