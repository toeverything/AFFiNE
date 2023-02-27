import { Trans, useTranslation } from '@affine/i18n';
import React, { useEffect, useState } from 'react';

import { getIsMobile } from '../../../utils/get-is-mobile';

// Inspire by https://stackoverflow.com/a/4900484/8415727
const getChromeVersion = () => {
  const raw = navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./);
  return raw ? parseInt(raw[2], 10) : false;
};
const getIsChrome = () => {
  return (
    /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)
  );
};
const minimumChromeVersion = 102;

export const shouldShowWarning = () => {
  return (
    !window.CLIENT_APP &&
    !getIsMobile() &&
    (!getIsChrome() || getChromeVersion() < minimumChromeVersion)
  );
};

export const OSWarningMessage: React.FC = () => {
  const { t } = useTranslation();
  const [notChrome, setNotChrome] = useState(false);
  const [notGoodVersion, setNotGoodVersion] = useState(false);
  useEffect(() => {
    setNotChrome(getIsChrome());
    setNotGoodVersion(getChromeVersion() < minimumChromeVersion);
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
