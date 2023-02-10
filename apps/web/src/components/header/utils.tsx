import getIsMobile from '@/utils/get-is-mobile';
import { Trans, useTranslation } from '@affine/i18n';
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

export const useWarningMessage = () => {
  const { t } = useTranslation();
  if (!getIsChrome()) {
    return (
      <span>
        <Trans i18nKey="recommendBrowser">
          We recommend the <strong>Chrome</strong> browser for optimal
          experience.
        </Trans>
      </span>
    );
  }
  if (getChromeVersion() < minimumChromeVersion) {
    return <span>{t('upgradeBrowser')}</span>;
  }
  return '';
};
