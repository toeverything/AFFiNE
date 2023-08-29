import { execSync } from 'node:child_process';

const {
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
  R2_BUCKET,
  OAUTH_EMAIL_SENDER,
  OAUTH_EMAIL_LOGIN,
  OAUTH_EMAIL_PASSWORD,
  AFFINE_GOOGLE_CLIENT_ID,
  AFFINE_GOOGLE_CLIENT_SECRET,
  CLOUD_SQL_IAM_ACCOUNT,
  GCLOUD_CONNECTION_NAME,
  GCLOUD_CLOUD_SQL_INTERNAL_ENDPOINT,
  REDIS_HOST,
  REDIS_PASSWORD,
} = process.env;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const buildType = BUILD_TYPE || 'canary';

const isProduction = buildType === 'stable';
const isBeta = buildType === 'beta';

const createHelmCommand = ({ isDryRun }) => {
  const flag = isDryRun ? '--dry-run' : '--atomic';
  const imageTag = `${buildType}-${GIT_SHORT_HASH}`;
  const staticIpName = isProduction
    ? 'affine-cluster-production'
    : isBeta
    ? 'affine-cluster-beta'
    : 'affine-cluster-dev';
  const redisAndPostgres =
    isProduction || isBeta
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
    isProduction || isBeta
      ? [
          `--set-json   web.service.annotations=\"{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }\"`,
          `--set-json   graphql.serviceAccount.annotations=\"{ \\"iam.gke.io/gcp-service-account\\": \\"${CLOUD_SQL_IAM_ACCOUNT}\\" }\"`,
          `--set-json   graphql.service.annotations=\"{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }\"`,
          `--set-json   sync.serviceAccount.annotations=\"{ \\"iam.gke.io/gcp-service-account\\": \\"${CLOUD_SQL_IAM_ACCOUNT}\\" }\"`,
          `--set-json   sync.service.annotations=\"{ \\"cloud.google.com/neg\\": \\"{\\\\\\"ingress\\\\\\": true}\\" }\"`,
        ]
      : [];
  const webReplicaCount = isProduction ? 3 : isBeta ? 2 : 1;
  const graphqlReplicaCount = isProduction ? 3 : isBeta ? 2 : 1;
  const syncReplicaCount = isProduction ? 6 : isBeta ? 3 : 1;
  const namespace = isProduction ? 'production' : isBeta ? 'beta' : 'dev';
  const deployCommand = [
    `helm upgrade --install affine .github/helm/affine`,
    `--namespace  ${namespace}`,
    `--set        global.ingress.enabled=true`,
    `--set-json   global.ingress.annotations=\"{ \\"kubernetes.io/ingress.class\\": \\"gce\\", \\"kubernetes.io/ingress.allow-http\\": \\"true\\", \\"kubernetes.io/ingress.global-static-ip-name\\": \\"${staticIpName}\\" }\"`,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    `--set-string global.ingress.host="${DEPLOY_HOST || CANARY_DEPLOY_HOST}"`,
    ...redisAndPostgres,
    `--set        web.replicaCount=${webReplicaCount}`,
    `--set-string web.image.tag="${imageTag}"`,
    `--set        graphql.replicaCount=${graphqlReplicaCount}`,
    `--set-string graphql.image.tag="${imageTag}"`,
    `--set        graphql.app.objectStorage.r2.enabled=true`,
    `--set-string graphql.app.objectStorage.r2.accountId="${R2_ACCOUNT_ID}"`,
    `--set-string graphql.app.objectStorage.r2.accessKeyId="${R2_ACCESS_KEY_ID}"`,
    `--set-string graphql.app.objectStorage.r2.secretAccessKey="${R2_SECRET_ACCESS_KEY}"`,
    `--set-string graphql.app.objectStorage.r2.bucket="${R2_BUCKET}"`,
    `--set-string graphql.app.oauth.email.sender="${OAUTH_EMAIL_SENDER}"`,
    `--set-string graphql.app.oauth.email.login="${OAUTH_EMAIL_LOGIN}"`,
    `--set-string graphql.app.oauth.email.password="${OAUTH_EMAIL_PASSWORD}"`,
    `--set-string graphql.app.oauth.google.enabled=true`,
    `--set-string graphql.app.oauth.google.clientId="${AFFINE_GOOGLE_CLIENT_ID}"`,
    `--set-string graphql.app.oauth.google.clientSecret="${AFFINE_GOOGLE_CLIENT_SECRET}"`,
    `--set        graphql.app.experimental.enableJwstCodec=true`,
    `--set        sync.replicaCount=${syncReplicaCount}`,
    `--set-string sync.image.tag="${imageTag}"`,
    ...serviceAnnotations,
    `--version "0.0.0-${buildType}.${GIT_SHORT_HASH}" --timeout 10m`,
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
