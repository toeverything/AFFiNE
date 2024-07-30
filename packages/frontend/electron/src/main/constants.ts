export const mainWindowOrigin = process.env.DEV_SERVER_URL || 'file://.';
export const onboardingViewUrl = `${mainWindowOrigin}${mainWindowOrigin.endsWith('/') ? '' : '/'}onboarding`;
export const shellViewUrl = `${mainWindowOrigin}${mainWindowOrigin.endsWith('/') ? '' : '/'}shell.html`;
