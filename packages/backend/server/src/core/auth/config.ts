import {
  defineRuntimeConfig,
  defineStartupConfig,
  ModuleConfig,
} from '../../fundamentals/config';

export interface AuthStartupConfigurations {
  /**
   * auth session config
   */
  session: {
    /**
     * Application auth expiration time in seconds
     */
    ttl: number;
    /**
     * Application auth time to refresh in seconds
     */
    ttr: number;
  };

  /**
   * Application access token config
   */
  accessToken: {
    /**
     * Application access token expiration time in seconds
     */
    ttl: number;
    /**
     * Application refresh token expiration time in seconds
     */
    refreshTokenTtl: number;
  };
}

export interface AuthRuntimeConfigurations {
  /**
   * Whether allow anonymous users to sign up
   */
  allowSignup: boolean;
  /**
   * The minimum and maximum length of the password when registering new users
   */
  password: {
    min: number;
    max: number;
  };
}

declare module '../../fundamentals/config' {
  interface AppConfig {
    auth: ModuleConfig<AuthStartupConfigurations, AuthRuntimeConfigurations>;
  }
}

defineStartupConfig('auth', {
  session: {
    ttl: 60 * 60 * 24 * 15, // 15 days
    ttr: 60 * 60 * 24 * 7, // 7 days
  },
  accessToken: {
    ttl: 60 * 60 * 24 * 7, // 7 days
    refreshTokenTtl: 60 * 60 * 24 * 30, // 30 days
  },
});

defineRuntimeConfig('auth', {
  allowSignup: {
    desc: 'Whether allow new registrations',
    default: true,
  },
  'password.min': {
    desc: 'The minimum length of user password',
    default: 8,
  },
  'password.max': {
    desc: 'The maximum length of user password',
    default: 32,
  },
});
