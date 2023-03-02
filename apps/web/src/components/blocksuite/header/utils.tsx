import { getEnvironment } from '@affine/env';
import { Trans, useTranslation } from '@affine/i18n';
import React, { useEffect, useState } from 'react';

const minimumChromeVersion = 102;

export const shouldShowWarning = () => {
  const env = getEnvironment();
  if (env.isDesktop) {
    // even though desktop have compatibility issues, we don't want to show the warning
    return false;
  }
  if (!env.isBrowser) {
    // disable in SSR
    return false;
  }
  if (env.isChrome) {
    return env.chromeVersion < minimumChromeVersion;
  } else {
    return !env.isMobile;
  }
};

export const OSWarningMessage: React.FC = () => {
  const { t } = useTranslation();
  const [notChrome, setNotChrome] = useState(false);
  const [notGoodVersion, setNotGoodVersion] = useState(false);
  useEffect(() => {
    const env = getEnvironment();
    setNotChrome(env.isBrowser && !env.isChrome);
    setNotGoodVersion(
      env.isBrowser && env.isChrome && env.chromeVersion < minimumChromeVersion
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
    return <span>{t('upgradeBrowser')}</span>;
  }
  return null;
};
