import getIsMobile from '@/utils/get-is-mobile';
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

export const getWarningMessage = () => {
  if (!getIsChrome()) {
    return (
      <span>
        We recommend the <strong>Chrome</strong> browser for optimal experience.
      </span>
    );
  }
  if (getChromeVersion() < minimumChromeVersion) {
    return (
      <span>
        Please upgrade to the latest version of Chrome for the best experience.
      </span>
    );
  }
  return '';
};
