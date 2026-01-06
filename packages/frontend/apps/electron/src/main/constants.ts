export const mainHost = '.';
export const anotherHost = 'another-host';

export const mainWindowOrigin = `assets://${mainHost}`;
export const anotherOrigin = `assets://${anotherHost}`;

export const onboardingViewUrl = `${mainWindowOrigin}/onboarding`;
export const shellViewUrl = `${mainWindowOrigin}/shell.html`;
export const backgroundWorkerViewUrl = `${mainWindowOrigin}/background-worker.html`;
export const customThemeViewUrl = `${mainWindowOrigin}/theme-editor`;

// mitigate the issue that popup window share the same zoom level of the main window
// Notes from electron official docs:
// "The zoom policy at the Chromium level is same-origin, meaning that the zoom level for a specific domain propagates across all instances of windows with the same domain. Differentiating the window URLs will make zoom work per-window."
export const popupViewUrl = `${anotherOrigin}/popup.html`;
