import {
  OAuthProviderType,
  ServerDeploymentType,
  ServerFeature,
} from '@affine/graphql';

import type { ServerConfig, ServerMetadata } from './types';

export const BUILD_IN_SERVERS: (ServerMetadata & { config: ServerConfig })[] =
  environment.isSelfHosted
    ? [
        {
          id: 'affine-cloud',
          baseUrl: location.origin,
          // selfhosted baseUrl is `location.origin`
          // this is ok for web app, but not for desktop app
          // since we never build desktop app in selfhosted mode, so it's fine
          config: {
            serverName: 'Affine Selfhost',
            features: [],
            oauthProviders: [],
            type: ServerDeploymentType.Selfhosted,
            credentialsRequirement: {
              password: {
                minLength: 8,
                maxLength: 32,
              },
            },
          },
        },
      ]
    : BUILD_CONFIG.debug
      ? [
          {
            id: 'affine-cloud',
            baseUrl: BUILD_CONFIG.isElectron
              ? 'http://localhost:8080'
              : location.origin,
            config: {
              serverName: 'Affine Cloud',
              features: [
                ServerFeature.Captcha,
                ServerFeature.Copilot,
                ServerFeature.OAuth,
                ServerFeature.Payment,
              ],
              oauthProviders: [OAuthProviderType.Google],
              type: ServerDeploymentType.Affine,
              credentialsRequirement: {
                password: {
                  minLength: 8,
                  maxLength: 32,
                },
              },
            },
          },
        ]
      : BUILD_CONFIG.appBuildType === 'stable'
        ? [
            {
              id: 'affine-cloud',
              baseUrl: 'https://app.affine.pro',
              config: {
                serverName: 'Affine Cloud',
                features: [
                  ServerFeature.Captcha,
                  ServerFeature.Copilot,
                  ServerFeature.OAuth,
                  ServerFeature.Payment,
                ],
                oauthProviders: [OAuthProviderType.Google],
                type: ServerDeploymentType.Affine,
                credentialsRequirement: {
                  password: {
                    minLength: 8,
                    maxLength: 32,
                  },
                },
              },
            },
          ]
        : BUILD_CONFIG.appBuildType === 'beta'
          ? [
              {
                id: 'affine-cloud',
                baseUrl: 'https://insider.affine.pro',
                config: {
                  serverName: 'Affine Cloud',
                  features: [
                    ServerFeature.Captcha,
                    ServerFeature.Copilot,
                    ServerFeature.OAuth,
                    ServerFeature.Payment,
                  ],
                  oauthProviders: [OAuthProviderType.Google],
                  type: ServerDeploymentType.Affine,
                  credentialsRequirement: {
                    password: {
                      minLength: 8,
                      maxLength: 32,
                    },
                  },
                },
              },
            ]
          : BUILD_CONFIG.appBuildType === 'internal'
            ? [
                {
                  id: 'affine-cloud',
                  baseUrl: 'https://insider.affine.pro',
                  config: {
                    serverName: 'Affine Cloud',
                    features: [
                      ServerFeature.Captcha,
                      ServerFeature.Copilot,
                      ServerFeature.OAuth,
                      ServerFeature.Payment,
                    ],
                    oauthProviders: [OAuthProviderType.Google],
                    type: ServerDeploymentType.Affine,
                    credentialsRequirement: {
                      password: {
                        minLength: 8,
                        maxLength: 32,
                      },
                    },
                  },
                },
              ]
            : BUILD_CONFIG.appBuildType === 'canary'
              ? [
                  {
                    id: 'affine-cloud',
                    baseUrl: 'https://affine.fail',
                    config: {
                      serverName: 'Affine Cloud',
                      features: [
                        ServerFeature.Captcha,
                        ServerFeature.Copilot,
                        ServerFeature.OAuth,
                        ServerFeature.Payment,
                      ],
                      oauthProviders: [OAuthProviderType.Google],
                      type: ServerDeploymentType.Affine,
                      credentialsRequirement: {
                        password: {
                          minLength: 8,
                          maxLength: 32,
                        },
                      },
                    },
                  },
                ]
              : [];
