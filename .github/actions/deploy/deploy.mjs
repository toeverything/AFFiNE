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
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  CAPTCHA_TURNSTILE_SECRET,
  METRICS_CUSTOMER_IO_TOKEN,
  COPILOT_OPENAI_API_KEY,
  COPILOT_FAL_API_KEY,
  COPILOT_GOOGLE_API_KEY,
  COPILOT_PERPLEXITY_API_KEY,
  COPILOT_UNSPLASH_API_KEY,
  MAILER_SENDER,
  MAILER_USER,
  MAILER_PASSWORD,
  AFFINE_GOOGLE_CLIENT_ID,
  AFFINE_GOOGLE_CLIENT_SECRET,
  CLOUD_SQL_IAM_ACCOUNT,
  APP_IAM_ACCOUNT,
  GCLOUD_CONNECTION_NAME,
  GCLOUD_CLOUD_SQL_INTERNAL_ENDPOINT,
  REDIS_HOST,
  REDIS_PASSWORD,
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_KEY,
  STATIC_IP_NAME,
} = process.env;

const buildType = BUILD_TYPE || 'canary';

const isProduction = buildType === 'stable';
const isBeta = buildType === 'beta';
const isInternal = buildType === 'internal';

const replicaConfig = {
  stable: {
    web: 3,
    graphql: Number(process.env.PRODUCTION_GRAPHQL_REPLICA) || 3,
    sync: Number(process.env.PRODUCTION_SYNC_REPLICA) || 3,
    renderer: Number(process.env.PRODUCTION_RENDERER_REPLICA) || 3,
    doc: Number(process.env.PRODUCTION_DOC_REPLICA) || 3,
  },
  beta: {
    web: 2,
    graphql: Number(process.env.BETA_GRAPHQL_REPLICA) || 2,
    sync: Number(process.env.BETA_SYNC_REPLICA) || 2,
    renderer: Number(process.env.BETA_RENDERER_REPLICA) || 2,
    doc: Number(process.env.BETA_DOC_REPLICA) || 2,
  },
  canary: {
    web: 2,
    graphql: 2,
    sync: 2,
    renderer: 2,
    doc: 2,
  },
};

const cpuConfig = {
  beta: {
    web: '300m',
    graphql: '1',
    sync: '1',
    doc: '1',
    renderer: '300m',
  },
  canary: {
    web: '300m',
    graphql: '1',
    sync: '1',
    doc: '1',
    renderer: '300m',
  },
};

const createHelmCommand = ({ isDryRun }) => {
  const flag = isDryRun ? '--dry-run' : '--atomic';
  const imageTag = `${buildType}-${GIT_SHORT_HASH}`;
  const redisAndPostgres =
    isProduction || isBeta || isInternal
      ? [
          `--set-string global.database.url=${DATABASE_URL}`,
          `--set-string global.database.user=${DATABASE_USERNAME}`,
          `--set-string global.database.password=${DATABASE_PASSWORD}`,
          `--set-string global.database.name=${DATABASE_NAME}`,
          `--set        global.database.gcloud.enabled=true`,
          `--set-string global.database.gcloud.connectionName="${GCLOUD_CONNECTION_NAME}"`,
          `--set-string global.database.gcloud.cloudSqlInternal="${GCLOUD_CLOUD_SQL_INTERNAL_ENDPOINT}"`,
          `--set-string global.redis.host="${REDIS_HOST}"`,
          `--set-string global.redis.password="${REDIS_PASSWORD}"`,
        ]
      : [];
  const serviceAnnotations = [
    `--set-json   web.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
    `--set-json   graphql.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
    `--set-json   sync.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
    `--set-json   doc.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${APP_IAM_ACCOUNT}\\" }"`,
  ].concat(
    isProduction || isBeta || isInternal
      ? [
          `--set-json   web.service.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   graphql.service.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   sync.service.annotations="{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }"`,
          `--set-json   cloud-sql-proxy.serviceAccount.annotations="{ \\"iam.gke.io/gcp-service-account\\": \\"${CLOUD_SQL_IAM_ACCOUNT}\\" }"`,
          `--set-json   cloud-sql-proxy.nodeSelector="{ \\"iam.gke.io/gke-metadata-server-enabled\\": \\"true\\" }"`,
        ]
      : []
  );

  const cpu = cpuConfig[buildType];
  const resources = cpu
    ? [
        `--set        web.resources.requests.cpu="${cpu.web}"`,
        `--set        graphql.resources.requests.cpu="${cpu.graphql}"`,
        `--set        sync.resources.requests.cpu="${cpu.sync}"`,
        `--set        doc.resources.requests.cpu="${cpu.doc}"`,
      ]
    : [];

  const replica = replicaConfig[buildType] || replicaConfig.canary;

  const namespace = isProduction
    ? 'production'
    : isBeta
      ? 'beta'
      : isInternal
        ? 'internal'
        : 'dev';

  const host = DEPLOY_HOST || CANARY_DEPLOY_HOST;
  const deployCommand = [
    `helm upgrade --install affine .github/helm/affine`,
    `--namespace  ${namespace}`,
    `--set-string global.app.buildType="${buildType}"`,
    `--set        global.ingress.enabled=true`,
    `--set-json   global.ingress.annotations="{ \\"kubernetes.io/ingress.class\\": \\"gce\\", \\"kubernetes.io/ingress.allow-http\\": \\"true\\", \\"kubernetes.io/ingress.global-static-ip-name\\": \\"${STATIC_IP_NAME}\\" }"`,
    `--set-string global.ingress.host="${host}"`,
    `--set        global.objectStorage.r2.enabled=true`,
    `--set-string global.objectStorage.r2.accountId="${R2_ACCOUNT_ID}"`,
    `--set-string global.objectStorage.r2.accessKeyId="${R2_ACCESS_KEY_ID}"`,
    `--set-string global.objectStorage.r2.secretAccessKey="${R2_SECRET_ACCESS_KEY}"`,
    `--set-string global.version="${APP_VERSION}"`,
    ...redisAndPostgres,
    `--set        web.replicaCount=${replica.web}`,
    `--set-string web.image.tag="${imageTag}"`,
    `--set        graphql.replicaCount=${replica.graphql}`,
    `--set-string graphql.image.tag="${imageTag}"`,
    `--set        graphql.app.host=${host}`,
    `--set        graphql.app.captcha.enabled=true`,
    `--set-string graphql.app.captcha.turnstile.secret="${CAPTCHA_TURNSTILE_SECRET}"`,
    `--set        graphql.app.copilot.enabled=true`,
    `--set-string graphql.app.copilot.openai.key="${COPILOT_OPENAI_API_KEY}"`,
    `--set-string graphql.app.copilot.fal.key="${COPILOT_FAL_API_KEY}"`,
    `--set-string graphql.app.copilot.google.key="${COPILOT_GOOGLE_API_KEY}"`,
    `--set-string graphql.app.copilot.perplexity.key="${COPILOT_PERPLEXITY_API_KEY}"`,
    `--set-string graphql.app.copilot.unsplash.key="${COPILOT_UNSPLASH_API_KEY}"`,
    `--set-string graphql.app.mailer.sender="${MAILER_SENDER}"`,
    `--set-string graphql.app.mailer.user="${MAILER_USER}"`,
    `--set-string graphql.app.mailer.password="${MAILER_PASSWORD}"`,
    `--set-string graphql.app.oauth.google.enabled=true`,
    `--set-string graphql.app.oauth.google.clientId="${AFFINE_GOOGLE_CLIENT_ID}"`,
    `--set-string graphql.app.oauth.google.clientSecret="${AFFINE_GOOGLE_CLIENT_SECRET}"`,
    `--set-string graphql.app.payment.stripe.apiKey="${STRIPE_API_KEY}"`,
    `--set-string graphql.app.payment.stripe.webhookKey="${STRIPE_WEBHOOK_KEY}"`,
    `--set        graphql.app.metrics.enabled=true`,
    `--set-string graphql.app.metrics.customerIo.token="${METRICS_CUSTOMER_IO_TOKEN}"`,
    `--set        graphql.app.experimental.enableJwstCodec=${namespace === 'dev'}`,
    `--set        graphql.app.features.earlyAccessPreview=false`,
    `--set        graphql.app.features.syncClientVersionCheck=true`,
    `--set        sync.replicaCount=${replica.sync}`,
    `--set-string sync.image.tag="${imageTag}"`,
    `--set-string renderer.image.tag="${imageTag}"`,
    `--set        renderer.app.host=${host}`,
    `--set        renderer.replicaCount=${replica.renderer}`,
    `--set-string doc.image.tag="${imageTag}"`,
    `--set        doc.app.host=${host}`,
    `--set        doc.app.copilot.enabled=true`,
    `--set-string doc.app.copilot.openai.key="${COPILOT_OPENAI_API_KEY}"`,
    `--set-string doc.app.copilot.fal.key="${COPILOT_FAL_API_KEY}"`,
    `--set-string doc.app.copilot.perplexity.key="${COPILOT_PERPLEXITY_API_KEY}"`,
    `--set-string doc.app.copilot.unsplash.key="${COPILOT_UNSPLASH_API_KEY}"`,
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
