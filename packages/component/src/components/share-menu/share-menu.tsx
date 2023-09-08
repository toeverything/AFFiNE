import type {
  AffineCloudWorkspace,
  AffineOfficialWorkspace,
  AffinePublicWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Page } from '@blocksuite/store';
import { Button } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';
import { Menu } from '@toeverything/components/menu';
import { useRef } from 'react';

import * as styles from './index.css';
import { ShareExport } from './share-export';
import { SharePage } from './share-page';

export interface ShareMenuProps<
  Workspace extends AffineOfficialWorkspace =
    | AffineCloudWorkspace
    | LocalWorkspace
    | AffinePublicWorkspace,
> {
  workspace: Workspace;
  currentPage: Page;
  useIsSharedPage: (
    workspaceId: string,
    pageId: string
  ) => [isSharePage: boolean, setIsSharePage: (enable: boolean) => void];
  onEnableAffineCloud: () => void;
  togglePagePublic: () => Promise<void>;
}

export const ShareMenu = (props: ShareMenuProps) => {
  const { useIsSharedPage } = props;
  const ref = useRef(null);
  const isSharedPage = useIsSharedPage(
    props.workspace.id,
    props.currentPage.id
  );
  const t = useAFFiNEI18N();
  const content = (
    <div className={styles.containerStyle}>
      <SharePage {...props} />
      <div className={styles.columnContainerStyle}>
        <Divider dividerColor="var(--affine-border-color)" size="thinner" />
      </div>
      <ShareExport />
    </div>
  );
  return (
    <Menu
      items={content}
      portalOptions={{
        container: ref.current,
      }}
    >
      <Button data-testid="share-menu-button" type="plain" ref={ref}>
        <div
          style={{
            color: isSharedPage
              ? 'var(--affine-link-color)'
              : 'var(--affine-text-primary-color)',
          }}
        >
          {isSharedPage
            ? t['com.affine.share-menu.sharedButton']()
            : t['com.affine.share-menu.shareButton']()}
        </div>
      </Button>
    </Menu>
  );
};
