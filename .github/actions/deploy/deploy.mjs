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
  COPILOT_OPENAI_API_KEY,
  COPILOT_FAL_API_KEY,
  COPILOT_UNSPLASH_API_KEY,
  MAILER_SENDER,
  MAILER_USER,
  MAILER_PASSWORD,
  AFFINE_GOOGLE_CLIENT_ID,
  AFFINE_GOOGLE_CLIENT_SECRET,
  CLOUD_SQL_IAM_ACCOUNT,
  GCLOUD_CONNECTION_NAME,
  GCLOUD_CLOUD_SQL_INTERNAL_ENDPOINT,
  REDIS_HOST,
  REDIS_PASSWORD,
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_KEY,
  STATIC_IP_NAME,
} = process.env;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const buildType = BUILD_TYPE || 'canary';

const isProduction = buildType === 'stable';
const isBeta = buildType === 'beta';
const isInternal = buildType === 'internal';

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
  const serviceAnnotations =
    isProduction || isBeta || isInternal
      ? [
          `--set-json   web.service.annotations=\"{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }\"`,
          `--set-json   graphql.service.annotations=\"{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }\"`,
          `--set-json   sync.service.annotations=\"{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }\"`,
          `--set-json   cloud-sql-proxy.serviceAccount.annotations=\"{ \\"iam.gke.io/gcp-service-account\\": \\"${CLOUD_SQL_IAM_ACCOUNT}\\" }\"`,
          `--set-json   cloud-sql-proxy.nodeSelector=\"{ \\"iam.gke.io/gke-metadata-server-enabled\\": \\"true\\" }\"`,
        ]
      : [];
  const webReplicaCount = isProduction ? 3 : isBeta ? 2 : 2;
  const graphqlReplicaCount = isProduction
    ? Number(process.env.PRODUCTION_GRAPHQL_REPLICA) || 3
    : isBeta
      ? Number(process.env.isBeta_GRAPHQL_REPLICA) || 2
      : 2;
  const syncReplicaCount = isProduction
    ? Number(process.env.PRODUCTION_SYNC_REPLICA) || 3
    : isBeta
      ? Number(process.env.BETA_SYNC_REPLICA) || 2
      : 2;
  const namespace = isProduction
    ? 'production'
    : isBeta
      ? 'beta'
      : isInternal
        ? 'internal'
        : 'dev';
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const host = DEPLOY_HOST || CANARY_DEPLOY_HOST;
  const deployCommand = [
    `helm upgrade --install affine .github/helm/affine`,
    `--namespace  ${namespace}`,
    `--set        global.ingress.enabled=true`,
    `--set-json   global.ingress.annotations=\"{ \\"kubernetes.io/ingress.class\\": \\"gce\\", \\"kubernetes.io/ingress.allow-http\\": \\"true\\", \\"kubernetes.io/ingress.global-static-ip-name\\": \\"${STATIC_IP_NAME}\\" }\"`,
    `--set-string global.ingress.host="${host}"`,
    `--set-string global.version="${APP_VERSION}"`,
    ...redisAndPostgres,
    `--set        web.replicaCount=${webReplicaCount}`,
    `--set-string web.image.tag="${imageTag}"`,
    `--set        graphql.replicaCount=${graphqlReplicaCount}`,
    `--set-string graphql.image.tag="${imageTag}"`,
    `--set        graphql.app.host=${host}`,
    `--set        graphql.app.captcha.enabled=true`,
    `--set-string graphql.app.captcha.turnstile.secret="${CAPTCHA_TURNSTILE_SECRET}"`,
    `--set        graphql.app.copilot.enabled=true`,
    `--set-string graphql.app.copilot.openai.key="${COPILOT_OPENAI_API_KEY}"`,
    `--set-string graphql.app.copilot.fal.key="${COPILOT_FAL_API_KEY}"`,
    `--set-string graphql.app.copilot.unsplash.key="${COPILOT_UNSPLASH_API_KEY}"`,
    `--set        graphql.app.objectStorage.r2.enabled=true`,
    `--set-string graphql.app.objectStorage.r2.accountId="${R2_ACCOUNT_ID}"`,
    `--set-string graphql.app.objectStorage.r2.accessKeyId="${R2_ACCESS_KEY_ID}"`,
    `--set-string graphql.app.objectStorage.r2.secretAccessKey="${R2_SECRET_ACCESS_KEY}"`,
    `--set-string graphql.app.mailer.sender="${MAILER_SENDER}"`,
    `--set-string graphql.app.mailer.user="${MAILER_USER}"`,
    `--set-string graphql.app.mailer.password="${MAILER_PASSWORD}"`,
    `--set-string graphql.app.oauth.google.enabled=true`,
    `--set-string graphql.app.oauth.google.clientId="${AFFINE_GOOGLE_CLIENT_ID}"`,
    `--set-string graphql.app.oauth.google.clientSecret="${AFFINE_GOOGLE_CLIENT_SECRET}"`,
    `--set-string graphql.app.payment.stripe.apiKey="${STRIPE_API_KEY}"`,
    `--set-string graphql.app.payment.stripe.webhookKey="${STRIPE_WEBHOOK_KEY}"`,
    `--set        graphql.app.experimental.enableJwstCodec=${namespace === 'dev'}`,
    `--set        graphql.app.features.earlyAccessPreview=false`,
    `--set        graphql.app.features.syncClientVersionCheck=true`,
    `--set        sync.replicaCount=${syncReplicaCount}`,
    `--set-string sync.image.tag="${imageTag}"`,
    ...serviceAnnotations,
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
