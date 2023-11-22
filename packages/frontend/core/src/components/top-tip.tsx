import { BrowserWarning } from '@affine/component/affine-banner';
import { DownloadTips } from '@affine/component/affine-banner';
import {
  type AffineOfficialWorkspace,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

import { authAtom } from '../atoms';
import { useCurrentLoginStatus } from '../hooks/affine/use-current-login-status';
import { useOnTransformWorkspace } from '../hooks/root/use-on-transform-workspace';
import { EnableAffineCloudModal } from './affine/enable-affine-cloud-modal';

const minimumChromeVersion = 102;

const shouldShowWarning = () => {
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
};

const OSWarningMessage = () => {
  const t = useAFFiNEI18N();
  const [notChrome, setNotChrome] = useState(false);
  const [notGoodVersion, setNotGoodVersion] = useState(false);
  useEffect(() => {
    setNotChrome(environment.isBrowser && !environment.isChrome);
    setNotGoodVersion(
      environment.isBrowser &&
        environment.isChrome &&
        environment.chromeVersion < minimumChromeVersion
    );
  }, []);

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
  workspace,
}: {
  workspace: AffineOfficialWorkspace;
}) => {
  const loginStatus = useCurrentLoginStatus();
  const isLoggedIn = loginStatus === 'authenticated';

  const [showWarning, setShowWarning] = useState(false);
  const [showDownloadTip, setShowDownloadTip] = useState(true);
  const [open, setOpen] = useState(false);

  const setAuthModal = useSetAtom(authAtom);
  const onLogin = useCallback(() => {
    setAuthModal({ openModal: true, state: 'signIn' });
  }, [setAuthModal]);

  const onTransformWorkspace = useOnTransformWorkspace();
  const handleConfirm = useCallback(() => {
    if (workspace.flavour !== WorkspaceFlavour.LOCAL) {
      return;
    }
    onTransformWorkspace(
      WorkspaceFlavour.LOCAL,
      WorkspaceFlavour.AFFINE_CLOUD,
      workspace
    );
    setOpen(false);
  }, [onTransformWorkspace, workspace]);

  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);

  if (
    showDownloadTip &&
    !environment.isDesktop &&
    workspace.flavour === WorkspaceFlavour.LOCAL
  ) {
    return (
      <>
        <DownloadTips
          isLoggedIn={isLoggedIn}
          onLogin={onLogin}
          onEnableCloud={() => setOpen(true)}
          onClose={() => {
            setShowDownloadTip(false);
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
