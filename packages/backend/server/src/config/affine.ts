/* eslint-disable @typescript-eslint/no-non-null-assertion */
//
// ###############################################################
// ##                AFFiNE Configuration System                ##
// ###############################################################
// Here is the file of all AFFiNE configurations that will affect runtime behavior.
// Override any configuration here and it will be merged when starting the server.
// Any changes in this file won't take effect before server restarted.
//
//
// > Configurations merge order
//   1. load environment variables (`.env` if provided, and from system)
//   2. load `src/fundamentals/config/default.ts` for all default settings
//   3. apply `./affine.ts` patches (this file)
//   4. apply `./affine.env.ts` patches
//
//
// ###############################################################
// ##                       General settings                    ##
// ###############################################################
//
// /* The unique identity of the server */
// AFFiNE.serverId = 'some-randome-uuid';
//
// /* The name of AFFiNE Server, may show on the UI */
// AFFiNE.serverName = 'Your Cool AFFiNE Selfhosted Cloud';
//
// /* Whether the server is deployed behind a HTTPS proxied environment */
AFFiNE.server.https = false;
// /* Domain of your server that your server will be available at */
AFFiNE.server.host = 'localhost';
// /* The local port of your server that will listen on */
AFFiNE.server.port = 3010;
// /* The sub path of your server */
// /* For example, if you set `AFFiNE.server.path = '/affine'`, then the server will be available at `${domain}/affine` */
// AFFiNE.server.path = '/affine';
// /* The external URL of your server, will be consist of protocol + host + port by default */
// /* Useful when you want to customize the link to server resources for example the doc share link or email link */
// AFFiNE.server.externalUrl = 'http://affine.local:8080'
//
//
// ###############################################################
// ##                   Server Function settings                ##
// ###############################################################
//
// /* Whether enable metrics and tracing while running the server */
// /* The metrics will be available at `http://localhost:9464/metrics` with [Prometheus] format exported */
// AFFiNE.metrics.enabled = true;
//
//
// AFFiNE.auth.session = {
//   /* How long the login session would last by default */
//   ttl: 15 * 24 * 60 * 60, // 15 days
//   /* How long we should refresh the token before it getting expired */
//   ttr: 7 * 24 * 60 * 60, // 7 days
// };
//
// /* GraphQL configurations that control the behavior of the Apollo Server behind */
// /* @see https://www.apollographql.com/docs/apollo-server/api/apollo-server */
// AFFiNE.graphql = {
//   /* Path to mount GraphQL API */
//   path: '/graphql',
//   buildSchemaOptions: {
//     numberScalarMode: 'integer',
//   },
//   /* Whether allow client to query the schema introspection */
//   introspection: true,
//   /* Whether enable GraphQL Playground UI */
//   playground: true,
// }
//
// /* Doc Store & Collaberation */
// /* How long the buffer time of creating a new history snapshot when doc get updated */
// AFFiNE.doc.history.interval = 1000 * 60 * 10; // 10 minutes
//
// /* How often the manager will start a new turn of merging pending updates into doc snapshot */
// AFFiNE.doc.manager.updatePollInterval = 1000 * 3;
//
//
// ###############################################################
// ##                        Plugins settings                   ##
// ###############################################################
//
// /* Redis Plugin */
// /* Provide caching and session storing backed by Redis. */
// /* Useful when you deploy AFFiNE server in a cluster. */
// AFFiNE.use('redis', {
//   /* override options */
// });
//
//
// /* Payment Plugin */
// AFFiNE.use('payment', {
//   stripe: { keys: {}, apiVersion: '2023-10-16' },
// });
//
//
// /* Captcha Plugin Default Config */
// AFFiNE.plugins.use('captcha', {
//   turnstile: {},
//   challenge: {
//     bits: 20,
//   },
// });
//
//
// /* Cloudflare R2 Plugin */
// /* Enable if you choose to store workspace blobs or user avatars in Cloudflare R2 Storage Service */
// AFFiNE.use('cloudflare-r2', {
//   accountId: '',
//   credentials: {
//     accessKeyId: '',
//     secretAccessKey: '',
//   },
// });
//
// /* AWS S3 Plugin */
// /* Enable if you choose to store workspace blobs or user avatars in AWS S3 Storage Service */
// AFFiNE.use('aws-s3', {
//  credentials: {
//    accessKeyId: '',
//    secretAccessKey: '',
// })
// /* Update the provider of storages */
// AFFiNE.storages.blob.provider = 'cloudflare-r2';
// AFFiNE.storages.avatar.provider = 'cloudflare-r2';
//
// /* OAuth Plugin */
// AFFiNE.use('oauth', {
//   providers: {
//     github: {
//       clientId: '',
//       clientSecret: '',
//       // See https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
//       args: {
//         scope: 'user',
//       },
//     },
//     google: {
//       clientId: '',
//       clientSecret: '',
//       args: {
//         // See https://developers.google.com/identity/protocols/oauth2
//         scope: 'openid email profile',
//         promot: 'select_account',
//         access_type: 'offline',
//       },
//     },
//     oidc: {
//       // OpenID Connect
//       issuer: '',
//       clientId: '',
//       clientSecret: '',
//       args: {
//         scope: 'openid email profile',
//         claim_id: 'preferred_username',
//         claim_email: 'email',
//         claim_name: 'name',
//       },
//     },
//   },
// });
//
// /* Copilot Plugin */
// AFFiNE.use('copilot', {
//   openai: {
//     apiKey: 'your-key',
//   },
//   fal: {
//     apiKey: 'your-key',
//   },
//   unsplashKey: 'your-key',
//   storage: {
//     provider: 'cloudflare-r2',
//     bucket: 'copilot',
//   }
// })
