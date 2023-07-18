import { isDesktop } from '@affine/env/constant';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type React from 'react';
import { useEffect, useState } from 'react';

const minimumChromeVersion = 102;

export const shouldShowWarning = () => {
  if (isDesktop) {
    // even though desktop have compatibility issues, we don't want to show the warning
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

export const OSWarningMessage: React.FC = () => {
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
          We recommend the <strong>Chrome</strong> browser for optimal
          experience.
        </Trans>
      </span>
    );
  } else if (notGoodVersion) {
    return <span>{t['upgradeBrowser']()}</span>;
  }
  return null;
};
