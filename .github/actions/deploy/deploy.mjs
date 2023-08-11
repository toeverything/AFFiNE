import { execSync } from 'node:child_process';

const {
  DEPLOY_ENV,
  DEV_ENV_HOST,
  GIT_SHORT_HASH,
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  OAUTH_EMAIL_SENDER,
  OAUTH_EMAIL_LOGIN,
  OAUTH_EMAIL_PASSWORD,
  AFFINE_GOOGLE_CLIENT_ID,
  AFFINE_GOOGLE_CLIENT_SECRET,
} = process.env;

const createHelmCommand = ({ isDryRun }) => {
  const flag = isDryRun ? '--dry-run' : '--atomic';
  const deployCommand = [
    `helm upgrade --install affine .github/helm/affine`,
    `--namespace  ${DEPLOY_ENV}`,
    `--set        global.ingress.enabled=true`,
    `--set-json   global.ingress.annotations=\"{ \\"kubernetes.io/ingress.class\\": \\"gce\\", \\"kubernetes.io/ingress.allow-http\\": \\"true\\", \\"kubernetes.io/ingress.global-static-ip-name\\": \\"affine-cluster-dev\\" }\"`,
    `--set-string global.ingress.host="${DEV_ENV_HOST}"`,
    `--set-string web.image.tag="${GIT_SHORT_HASH}"`,
    `--set-string graphql.image.tag="${GIT_SHORT_HASH}"`,
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
    `--set-string sync.image.tag="${GIT_SHORT_HASH}"`,
    `--version "0.0.0-alpha.${GIT_SHORT_HASH}" --timeout 10m`,
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
