import { channelToScheme } from './constant';

// return an AFFiNE app's url to be opened in desktop app
export const getOpenUrlInDesktopAppLink = (
  url: string,
  newTab = false,
  scheme = channelToScheme[BUILD_CONFIG.appBuildType]
) => {
  if (!scheme) {
    return null;
  }

  const urlObject = new URL(url);
  const params = urlObject.searchParams;

  if (newTab) {
    params.set('new-tab', '1');
  }

  return `${scheme}://${urlObject.hostname}${urlObject.pathname}?${params.toString()}#${urlObject.hash}`;
};
