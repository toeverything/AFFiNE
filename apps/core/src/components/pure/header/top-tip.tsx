import { BrowserWarning } from '@affine/component/affine-banner';
import { DownloadTips } from '@affine/component/affine-banner';
import { isDesktop } from '@affine/env/constant';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom } from 'jotai';
import { useEffect, useState } from 'react';

import { guideDownloadClientTipAtom } from '../../../atoms/guide';

const minimumChromeVersion = 102;

const shouldShowWarning = () => {
  if (isDesktop) {
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
export const TopTip = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [showDownloadTip, setShowDownloadTip] = useAtom(
    guideDownloadClientTipAtom
  );

  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);

  if (showDownloadTip && isDesktop) {
    return (
      <DownloadTips
        onClose={() => {
          setShowDownloadTip(false);
          localStorage.setItem('affine-is-dt-hide', '1');
        }}
      />
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
