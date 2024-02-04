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
AFFiNE.https = false;
// /* Domain of your server that your server will be available at */
AFFiNE.host = 'localhost';
// /* The local port of your server that will listen on */
AFFiNE.port = 3010;
// /* The sub path of your server */
// /* For example, if you set `AFFiNE.path = '/affine'`, then the server will be available at `${domain}/affine` */
// AFFiNE.path = '/affine';
//
//
// ###############################################################
// ##                       Database settings                   ##
// ###############################################################
//
// /* The URL of the database where most of AFFiNE server data will be stored in */
// AFFiNE.db.url = 'postgres://user:passsword@localhost:5432/affine';
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
// /* Use `y-octo` to merge updates at the same time when merging using Yjs */
// AFFiNE.doc.manager.experimentalMergeWithYOcto = true;
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
AFFiNE.plugins.use('redis', {
  /* override options */
});
// /* Payment Plugin */
AFFiNE.plugins.use('payment', {
  stripe: { keys: {}, apiVersion: '2023-10-16' },
});
//
