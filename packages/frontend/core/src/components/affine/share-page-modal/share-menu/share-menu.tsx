import { Button } from '@affine/component/ui/button';
import { Divider } from '@affine/component/ui/divider';
import { Menu } from '@affine/component/ui/menu';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { WebIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import type { WorkspaceMetadata } from '@toeverything/infra';
import clsx from 'clsx';

import { useIsSharedPage } from '../../../../hooks/affine/use-is-shared-page';
import * as styles from './index.css';
import { ShareExport } from './share-export';
import { SharePage } from './share-page';

export interface ShareMenuProps {
  workspaceMetadata: WorkspaceMetadata;
  currentPage: Page;
  isJournal?: boolean;
  onEnableAffineCloud: () => void;
}

const ShareMenuContent = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.containerStyle}>
      <div className={styles.headerStyle}>
        <div className={styles.shareIconStyle}>
          <WebIcon />
        </div>
        {t['com.affine.share-menu.SharePage']()}
      </div>
      <SharePage {...props} />
      <div className={styles.columnContainerStyle}>
        <Divider size="thinner" />
      </div>
      <ShareExport {...props} />
    </div>
  );
};

const LocalShareMenu = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  return (
    <Menu
      items={<ShareMenuContent {...props} />}
      contentOptions={{
        className: styles.menuStyle,
        ['data-testid' as string]: 'local-share-menu',
      }}
      rootOptions={{
        modal: false,
      }}
    >
      <Button
        className={clsx({ [styles.journalShareButton]: props.isJournal })}
        data-testid="local-share-menu-button"
        type="primary"
      >
        {t['com.affine.share-menu.shareButton']()}
      </Button>
    </Menu>
  );
};

const CloudShareMenu = (props: ShareMenuProps) => {
  const t = useAFFiNEI18N();
  const {
    workspaceMetadata: { id: workspaceId },
    currentPage,
  } = props;
  const { isSharedPage } = useIsSharedPage(workspaceId, currentPage.id);

  return (
    <Menu
      items={<ShareMenuContent {...props} />}
      contentOptions={{
        className: styles.menuStyle,
        ['data-testid' as string]: 'cloud-share-menu',
      }}
      rootOptions={{
        modal: false,
      }}
    >
      <Button
        className={clsx({ [styles.journalShareButton]: props.isJournal })}
        data-testid="cloud-share-menu-button"
        type="primary"
      >
        {isSharedPage
          ? t['com.affine.share-menu.sharedButton']()
          : t['com.affine.share-menu.shareButton']()}
      </Button>
    </Menu>
  );
};

export const ShareMenu = (props: ShareMenuProps) => {
  const { workspaceMetadata } = props;

  if (workspaceMetadata.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalShareMenu {...props} />;
  }
  return <CloudShareMenu {...props} />;
};
