import { Empty, IconButton } from '@affine/component';
import { Trans, useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import type { DocCollection } from '@blocksuite/store';
import type { ReactNode } from 'react';

import * as styles from './page-list-empty.css';

export const EmptyPageList = ({
  type,
  heading,
}: {
  type: 'all' | 'trash' | 'shared' | 'public';
  docCollection: DocCollection;
  heading?: ReactNode;
}) => {
  const t = useI18n();

  const getEmptyDescription = () => {
    if (type === 'all') {
      const createNewPageButton = (
        <IconButton
          withoutHover
          className={styles.plusButton}
          variant="solid"
          icon={<PlusIcon />}
        />
      );
      if (environment.isDesktop) {
        const shortcut = environment.isMacOs ? '⌘ + N' : 'Ctrl + N';
        return (
          <Trans i18nKey="emptyAllPagesClient">
            Click on the {createNewPageButton} button Or press
            <kbd className={styles.emptyDescKbd}>{{ shortcut } as any}</kbd> to
            create your first page.
          </Trans>
        );
      }
      return (
        <Trans i18nKey="emptyAllPages">
          Click on the
          {createNewPageButton}
          button to create your first page.
        </Trans>
      );
    }
    if (type === 'trash') {
      return t['com.affine.workspaceSubPath.trash.empty-description']();
    }
    if (type === 'shared') {
      return t['emptySharedPages']();
    }
    return;
  };

  return (
    <div className={styles.pageListEmptyStyle}>
      {heading && <div>{heading}</div>}
      <Empty
        title={t['com.affine.emptyDesc']()}
        description={
          <span className={styles.descWrapper}>{getEmptyDescription()}</span>
        }
      />
    </div>
  );
};

export const EmptyCollectionList = ({ heading }: { heading: ReactNode }) => {
  const t = useI18n();
  return (
    <div className={styles.pageListEmptyStyle}>
      {heading && <div>{heading}</div>}
      <Empty title={t['com.affine.emptyDesc.collection']()} />
    </div>
  );
};

export const EmptyTagList = ({ heading }: { heading: ReactNode }) => {
  const t = useI18n();
  return (
    <div className={styles.pageListEmptyStyle}>
      {heading && <div>{heading}</div>}
      <Empty title={t['com.affine.emptyDesc.tag']()} />
    </div>
  );
};
