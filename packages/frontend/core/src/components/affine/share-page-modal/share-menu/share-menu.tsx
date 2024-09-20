import { Tabs, Tooltip } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { Menu } from '@affine/component/ui/menu';
import { ShareInfoService } from '@affine/core/modules/share-doc';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useI18n } from '@affine/i18n';
import type { Doc } from '@blocksuite/affine/store';
import { LockIcon, PublishIcon } from '@blocksuite/icons/rc';
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
  onOpenShareModal?: (open: boolean) => void;
}

export const ShareMenuContent = (props: ShareMenuProps) => {
  const t = useI18n();
  return (
    <div className={styles.containerStyle}>
      <Tabs.Root defaultValue="share">
        <Tabs.List>
          <Tabs.Trigger value="share">
            {t['com.affine.share-menu.shareButton']()}
          </Tabs.Trigger>
          <Tabs.Trigger value="export">{t['Export']()}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="share">
          <SharePage {...props} />
        </Tabs.Content>
        <Tabs.Content value="export">
          <ShareExport />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};

const DefaultShareButton = forwardRef(function DefaultShareButton(
  _,
  ref: Ref<HTMLButtonElement>
) {
  const t = useI18n();
  const shareInfoService = useService(ShareInfoService);
  const shared = useLiveData(shareInfoService.shareInfo.isShared$);

  useEffect(() => {
    shareInfoService.shareInfo.revalidate();
  }, [shareInfoService]);

  return (
    <Tooltip
      content={
        shared
          ? t['com.affine.share-menu.option.link.readonly.description']()
          : t['com.affine.share-menu.option.link.no-access.description']()
      }
    >
      <Button ref={ref} className={styles.button}>
        <div className={styles.buttonContainer}>
          {shared ? <PublishIcon fontSize={16} /> : <LockIcon fontSize={16} />}
          {t['com.affine.share-menu.shareButton']()}
        </div>
      </Button>
    </Tooltip>
  );
});

const LocalShareMenu = (props: ShareMenuProps) => {
  return (
    <Menu
      items={<ShareMenuContent {...props} />}
      contentOptions={{
        className: styles.menuStyle,
        ['data-testid' as string]: 'local-share-menu',
        align: 'end',
      }}
      rootOptions={{
        modal: false,
        onOpenChange: props.onOpenShareModal,
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
        align: 'end',
      }}
      rootOptions={{
        modal: false,
        onOpenChange: props.onOpenShareModal,
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
