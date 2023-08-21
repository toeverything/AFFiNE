import type {
  AffineCloudWorkspace,
  AffineOfficialWorkspace,
  AffinePublicWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import type { Page } from '@blocksuite/store';
import { Button } from '@toeverything/components/button';
import { Divider } from '@toeverything/components/divider';
import { useBlockSuiteWorkspacePageIsPublic } from '@toeverything/hooks/use-block-suite-workspace-page-is-public';
import { useState } from 'react';

import { Menu } from '../../ui/menu/menu';
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
  onEnableAffineCloud: () => void;
  togglePagePublic: () => Promise<void>;
}

export const ShareMenu = (props: ShareMenuProps) => {
  const [isPublic] = useBlockSuiteWorkspacePageIsPublic(props.currentPage);
  const [open, setOpen] = useState(false);
  const content = (
    <div className={styles.containerStyle}>
      <SharePage {...props} />
      <div className={styles.rowContainerStyle}>
        <Divider dividerColor="var(--affine-border-color)" />
      </div>
      <ShareExport />
    </div>
  );
  return (
    <Menu
      menuStyles={{
        padding: '12px',
        background: 'var(--affine-background-overlay-panel-color)',
        transform: 'translateX(-10px)',
      }}
      content={content}
      visible={open}
      placement="bottom"
      trigger={['click']}
      width={410}
      disablePortal={true}
      onClickAway={() => {
        setOpen(false);
      }}
    >
      <Button
        data-testid="share-menu-button"
        onClick={() => {
          setOpen(!open);
        }}
        type={'plain'}
      >
        <div
          style={{
            color: isPublic
              ? 'var(--affine-link-color)'
              : 'var(--affine-text-primary-color)',
          }}
        >
          {isPublic ? 'Shared' : 'Share'}
        </div>
      </Button>
    </Menu>
  );
};
