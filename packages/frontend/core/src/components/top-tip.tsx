import { BrowserWarning } from '@affine/component/affine-banner';
import { LocalDemoTips } from '@affine/component/affine-banner';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type Workspace, WorkspaceManager } from '@toeverything/infra';
import { useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { useCallback, useState } from 'react';

import { authAtom } from '../atoms';
import { useCurrentLoginStatus } from '../hooks/affine/use-current-login-status';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { WorkspaceSubPath } from '../shared';
import { EnableAffineCloudModal } from './affine/enable-affine-cloud-modal';

const minimumChromeVersion = 106;

const shouldShowWarning = (() => {
  if (environment.isDesktop) {
    // even though desktop has compatibility issues,
    //  we don't want to show the warning
    return false;
  }
  if (!environment.isBrowser) {
    // disable in SSR
    return false;
  }
  if (environment.isChrome) {
    return environment.chromeVersion < minimumChromeVersion;
  } else {
    return !environment.isMobile;
  }
})();

const OSWarningMessage = () => {
  const t = useAFFiNEI18N();
  const notChrome = environment.isBrowser && !environment.isChrome;
  const notGoodVersion =
    environment.isBrowser &&
    environment.isChrome &&
    environment.chromeVersion < minimumChromeVersion;

  if (notChrome) {
    return (
      <span>
        <Trans i18nKey="recommendBrowser">
          We recommend the <strong>Chrome</strong> browser for an optimal
          experience.
        </Trans>
      </span>
    );
  } else if (notGoodVersion) {
    return <span>{t['upgradeBrowser']()}</span>;
  }
  return null;
};

export const TopTip = ({
  pageId,
  workspace,
}: {
  pageId?: string;
  workspace: Workspace;
}) => {
  const loginStatus = useCurrentLoginStatus();
  const isLoggedIn = loginStatus === 'authenticated';

  const [showWarning, setShowWarning] = useState(shouldShowWarning);
  const [showLocalDemoTips, setShowLocalDemoTips] = useState(true);
  const [open, setOpen] = useState(false);

  const setAuthModal = useSetAtom(authAtom);
  const onLogin = useCallback(() => {
    setAuthModal({ openModal: true, state: 'signIn' });
  }, [setAuthModal]);

  const { openPage } = useNavigateHelper();
  const workspaceManager = useService(WorkspaceManager);
  const handleConfirm = useAsyncCallback(async () => {
    if (workspace.flavour !== WorkspaceFlavour.LOCAL) {
      return;
    }
    // TODO: we need to transform local to cloud
    const { id: newId } =
      await workspaceManager.transformLocalToCloud(workspace);
    openPage(newId, pageId || WorkspaceSubPath.ALL);
    setOpen(false);
  }, [openPage, pageId, workspace, workspaceManager]);

  if (
    showLocalDemoTips &&
    !environment.isDesktop &&
    workspace.flavour === WorkspaceFlavour.LOCAL
  ) {
    return (
      <>
        <LocalDemoTips
          isLoggedIn={isLoggedIn}
          onLogin={onLogin}
          onEnableCloud={() => setOpen(true)}
          onClose={() => {
            setShowLocalDemoTips(false);
          }}
        />
        <EnableAffineCloudModal
          open={open}
          onOpenChange={setOpen}
          onConfirm={handleConfirm}
        />
      </>
    );
  }

  return (
    <BrowserWarning
      show={showWarning}
      message={<OSWarningMessage />}
      onClose={() => {
        setShowWarning(false);
      }}
    />
  );
};
