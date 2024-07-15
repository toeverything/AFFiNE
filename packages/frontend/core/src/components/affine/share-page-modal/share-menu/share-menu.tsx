import { Button } from '@affine/component/ui/button';
import { Divider } from '@affine/component/ui/divider';
import { Menu } from '@affine/component/ui/menu';
import { ShareService } from '@affine/core/modules/share-doc';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import { WebIcon } from '@blocksuite/icons/rc';
import type { Doc } from '@blocksuite/store';
import {
  useLiveData,
  useService,
  type WorkspaceMetadata,
} from '@toeverything/infra';
import { forwardRef, type PropsWithChildren, type Ref, useEffect } from 'react';

import * as styles from './index.css';
import { ShareExport } from './share-export';
import { SharePage } from './share-page';

export interface ShareMenuProps extends PropsWithChildren {
  workspaceMetadata: WorkspaceMetadata;
  currentPage: Doc;
  onEnableAffineCloud: () => void;
}

export const ShareMenuContent = (props: ShareMenuProps) => {
  const t = useI18n();
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

const DefaultShareButton = forwardRef(function DefaultShareButton(
  _,
  ref: Ref<HTMLButtonElement>
) {
  const t = useI18n();
  const shareService = useService(ShareService);
  const shared = useLiveData(shareService.share.isShared$);

  useEffect(() => {
    shareService.share.revalidate();
  }, [shareService]);

  return (
    <Button ref={ref} className={styles.shareButton} type="primary">
      {shared
        ? t['com.affine.share-menu.sharedButton']()
        : t['com.affine.share-menu.shareButton']()}
    </Button>
  );
});

const LocalShareMenu = (props: ShareMenuProps) => {
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
      <div data-testid="local-share-menu-button">
        {props.children || <DefaultShareButton />}
      </div>
    </Menu>
  );
};

const CloudShareMenu = (props: ShareMenuProps) => {
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
      <div data-testid="cloud-share-menu-button">
        {props.children || <DefaultShareButton />}
      </div>
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
