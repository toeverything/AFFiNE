import { CLOUD_BASE_URL } from './config';

export const mainWindowOrigin = CLOUD_BASE_URL;
export const onboardingViewUrl = `${mainWindowOrigin}${mainWindowOrigin.endsWith('/') ? '' : '/'}onboarding`;
export const shellViewUrl = `${mainWindowOrigin}${mainWindowOrigin.endsWith('/') ? '' : '/'}shell.html`;
export const customThemeViewUrl = `${mainWindowOrigin}${mainWindowOrigin.endsWith('/') ? '' : '/'}theme-editor`;
