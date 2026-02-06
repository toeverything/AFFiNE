import { execSync } from 'node:child_process';

const {
  APP_VERSION,
  BUILD_TYPE,
  DEPLOY_HOST,
  CANARY_DEPLOY_HOST,
  GIT_SHORT_HASH,
  DATABASE_URL,
  DATABASE_USERNAME,
  DATABASE_PASSWORD,
  DATABASE_NAME,
  GCLOUD_CONNECTION_NAME,
  CLOUD_SQL_IAM_ACCOUNT,
  APP_IAM_ACCOUNT,
  REDIS_SERVER_HOST,
  REDIS_SERVER_PASSWORD,
  STATIC_IP_NAME,
  AFFINE_INDEXER_SEARCH_PROVIDER,
  AFFINE_INDEXER_SEARCH_ENDPOINT,
  AFFINE_INDEXER_SEARCH_API_KEY,
} = process.env;

const buildType = BUILD_TYPE || 'canary';

const isProduction = buildType === 'stable';
const isBeta = buildType === 'beta';
const isInternal = buildType === 'internal';

const replicaConfig = {
  stable: {
    front: Number(process.env.PRODUCTION_FRONT_REPLICA) || 2,
    graphql: Number(process.env.PRODUCTION_GRAPHQL_REPLICA) || 2,
    doc: Number(process.env.PRODUCTION_DOC_REPLICA) || 2,
  },
  beta: {
    front: Number(process.env.BETA_FRONT_REPLICA) || 1,
    graphql: Number(process.env.BETA_GRAPHQL_REPLICA) || 1,
    doc: Number(process.env.BETA_DOC_REPLICA) || 1,
  },
  canary: { front: 1, graphql: 1, doc: 1 },
};

const cpuConfig = {
  beta: { front: '2', graphql: '1', doc: '1' },
  canary: { front: '500m', graphql: '1', doc: '500m' },
};

const memoryConfig = {
  beta: { front: '1Gi', graphql: '1Gi', doc: '1Gi' },
  canary: { front: '512Mi', graphql: '512Mi', doc: '512Mi' },
};

const createHelmCommand = ({ isDryRun }) => {
  const flag = isDryRun ? '--dry-run' : '--atomic';
  const imageTag = `${buildType}-${GIT_SHORT_HASH}`;
  const redisAndPostgres =
    isProduction || isBeta || isInternal
      ? [
          `--set        cloud-sql-proxy.enabled=true`,
          `--set-string cloud-sql-proxy.database.connectionName="${GCLOUD_CONNECTION_NAME}"`,
          `--set-string global.database.host=${DATABASE_URL}`,
          `--set-string global.database.user=${DATABASE_USERNAME}`,
          `--set-string global.database.password=${DATABASE_PASSWORD}`,
          `--set-string global.database.name=${DATABASE_NAME}`,
          `--set-string global.redis.host="${REDIS_SERVER_HOST}"`,
          `--set-string global.redis.password="${REDIS_SERVER_PASSWORD}"`,
        ]
      : [];
  const indexerOptions = [
    `--set-string global.indexer.provider="${AFFINE_INDEXER_SEARCH_PROVIDER}"`,
    `--set-string global.indexer.endpoint="${AFFINE_INDEXER_SEARCH_ENDPOINT}"`,
    `--set-string global.indexer.apiKey="${AFFINE_INDEXER_SEARCH_API_KEY}"`,
  ];
  const serviceAnnotations = [
    `--set-json   front.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
    `--set-json   graphql.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
    `--set-json   doc.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
  ].concat(
    isProduction || isBeta || isInternal
      ? [
          `--set-json   front.services.web.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   front.services.sync.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   front.services.renderer.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   graphql.service.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   cloud-sql-proxy.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${CLOUD_SQL_IAM_ACCOUNT}\\" }"`,
          `--set-json   cloud-sql-proxy.nodeSelector="{ \\"iam.gke.io/gke-metadata-server-enabled\\": \\"true\\" }"`,
        ]
      : []
  );

  const cpu = cpuConfig[buildType];
  const memory = memoryConfig[buildType];
  let resources = [];
  if (cpu) {
    resources = resources.concat([
      `--set        front.resources.requests.cpu="${cpu.front}"`,
      `--set        graphql.resources.requests.cpu="${cpu.graphql}"`,
      `--set        doc.resources.requests.cpu="${cpu.doc}"`,
    ]);
  }
  if (memory) {
    resources = resources.concat([
      `--set        front.resources.requests.memory="${memory.front}"`,
      `--set        graphql.resources.requests.memory="${memory.graphql}"`,
      `--set        doc.resources.requests.memory="${memory.doc}"`,
    ]);
  }

  const replica = replicaConfig[buildType] || replicaConfig.canary;

  const namespace = isProduction
    ? 'production'
    : isBeta
      ? 'beta'
      : isInternal
        ? 'internal'
        : 'dev';

  const hosts = (DEPLOY_HOST || CANARY_DEPLOY_HOST)
    .split(',')
    .map(host => host.trim())
    .filter(host => host);
  const primaryHost = hosts[0] || '0.0.0.0';
  const deployCommand = [
    `helm upgrade --install affine .github/helm/affine`,
    `--namespace  ${namespace}`,
    `--set-string global.deployment.type="affine"`,
    `--set-string global.deployment.platform="gcp"`,
    `--set-string global.app.buildType="${buildType}"`,
    `--set        global.ingress.enabled=true`,
    `--set-json   global.ingress.annotations="{ \\"kubernetes.io/ingress.class\\": \\"gce\\", \\"kubernetes.io/ingress.allow-http\\": \\"true\\", \\"kubernetes.io/ingress.global-static-ip-name\\": \\"${STATIC_IP_NAME}\\" }"`,
    ...hosts.map(
      (host, index) => `--set global.ingress.hosts[${index}]=${host}`
    ),
    `--set-string global.version="${APP_VERSION}"`,
    ...redisAndPostgres,
    ...indexerOptions,
    `--set        front.replicaCount=${replica.front}`,
    `--set-string front.image.tag="${imageTag}"`,
    `--set-string front.app.host="${primaryHost}"`,
    `--set        graphql.replicaCount=${replica.graphql}`,
    `--set-string graphql.image.tag="${imageTag}"`,
    `--set-string graphql.app.host="${primaryHost}"`,
    `--set-string doc.image.tag="${imageTag}"`,
    `--set-string doc.app.host="${primaryHost}"`,
    `--set        doc.replicaCount=${replica.doc}`,
    ...serviceAnnotations,
    ...resources,
    `--timeout 10m`,
    flag,
  ].join(' ');
  return deployCommand;
};

const output = execSync(createHelmCommand({ isDryRun: true }), {
  encoding: 'utf-8',
  stdio: ['inherit', 'pipe', 'inherit'],
});
const templates = output
  .split('---')
  .filter(yml => !yml.split('\n').some(line => line.trim() === 'kind: Secret'))
  .join('---');
console.log(templates);

execSync(createHelmCommand({ isDryRun: false }), {
  encoding: 'utf-8',
  stdio: 'inherit',
});
