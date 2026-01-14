declare interface BUILD_CONFIG_TYPE {
  debug: boolean;
  distribution: 'web' | 'desktop' | 'admin' | 'mobile' | 'ios' | 'android';
  /**
   * 'web' | 'desktop' | 'admin'
   */
  isDesktopEdition: boolean;
  /**
   * 'mobile'
   */
  isMobileEdition: boolean;

  isElectron: boolean;
  isWeb: boolean;
  /**
   * 'desktop' | 'ios' | 'android'
   */
  isNative: boolean;
  isMobileWeb: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isAdmin: boolean;

  appVersion: string;
  editorVersion: string;
  appBuildType: 'stable' | 'beta' | 'internal' | 'canary';

  githubUrl: string;
  changelogUrl: string;
  pricingUrl: string;
  downloadUrl: string;
  discordUrl: string;
  requestLicenseUrl: string;
  // see: tools/workers
  imageProxyUrl: string;
  linkPreviewUrl: string;

  CAPTCHA_SITE_KEY: string;
  SENTRY_DSN: string;
  MIXPANEL_TOKEN: string;
  GA4_MEASUREMENT_ID: string;
}

declare var BUILD_CONFIG: BUILD_CONFIG_TYPE;
