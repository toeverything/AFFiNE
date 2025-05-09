import { BrowserWindow, type Display, type Rectangle, screen } from 'electron';

import { isMacOS } from '../../shared/utils';

export const getCurrentDisplay = (browserWindow: BrowserWindow) => {
  const position = browserWindow.getPosition();
  const size = browserWindow.getSize();
  const currentDisplay = screen.getDisplayNearestPoint({
    x: position[0] + size[0] / 2,
    y: position[1] + size[1] / 2,
  });
  return currentDisplay;
};

export const getScreenSize = (display: Display | BrowserWindow): Rectangle => {
  if (display instanceof BrowserWindow) {
    return getScreenSize(getCurrentDisplay(display));
  }
  return isMacOS() ? display.bounds : display.workArea;
};

export const fullscreenAndCenter = (browserWindow: BrowserWindow) => {
  const currentDisplay = getCurrentDisplay(browserWindow);
  const { width, height } = getScreenSize(currentDisplay);
  browserWindow.setSize(width, height);
  browserWindow.center();
};
