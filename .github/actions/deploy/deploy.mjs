import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const {
  APP_VERSION,
  BUILD_TYPE = 'canary',
  GIT_SHORT_HASH,
  SERVER_CONFIG,
  GCLOUD_CONNECTION_NAME,
  CLOUD_SQL_IAM_ACCOUNT,
  APP_IAM_ACCOUNT,
  STATIC_IP_NAME,
} = process.env;

const namespaces = {
  stable: 'production',
  beta: 'beta',
  canary: 'dev',
  internal: 'internal',
};
const namespace = namespaces[BUILD_TYPE];
if (!namespace || !APP_VERSION || !GIT_SHORT_HASH) {
  throw new Error(
    'BUILD_TYPE, APP_VERSION and GIT_SHORT_HASH must identify the release'
  );
}
if (!SERVER_CONFIG) {
  throw new Error(
    `Configure the ${BUILD_TYPE} environment SERVER_CONFIG secret before deploying`
  );
}
let serverConfig;
try {
  serverConfig = JSON.parse(SERVER_CONFIG);
} catch {
  throw new Error('SERVER_CONFIG must be valid JSON');
}
if (
  serverConfig?.deployment?.type !== 'cloud' ||
  !serverConfig.db?.datasourceUrl ||
  !serverConfig.redis?.host ||
  !serverConfig.crypto?.privateKey ||
  !serverConfig.server?.host ||
  !['manticoresearch', 'elasticsearch'].includes(
    serverConfig.indexer?.provider?.type
  )
) {
  throw new Error(
    'SERVER_CONFIG requires cloud deployment, database, Redis, crypto key, server host and a remote search provider'
  );
}
const database = new URL(serverConfig.db.datasourceUrl);
const hosts = [
  ...new Set([serverConfig.server.host, ...(serverConfig.server.hosts ?? [])]),
];
const cloudSql = ['stable', 'beta', 'internal'].includes(BUILD_TYPE);
const spot = ['beta', 'canary'].includes(BUILD_TYPE);
const imageTag = `${BUILD_TYPE}-${GIT_SHORT_HASH}`;
const serviceAccount = {
  annotations: { 'iam.gke.io/gcp-service-account': APP_IAM_ACCOUNT },
};
const nodeSelector = spot ? { 'cloud.google.com/gke-spot': 'true' } : {};
const neg = { 'cloud.google.com/neg': '{"ingress": true}' };
const replicas = {
  stable: {
    front: Number(process.env.PRODUCTION_FRONT_REPLICA) || 2,
    graphql: Number(process.env.PRODUCTION_GRAPHQL_REPLICA) || 2,
  },
  beta: {
    front: Number(process.env.BETA_FRONT_REPLICA) || 1,
    graphql: Number(process.env.BETA_GRAPHQL_REPLICA) || 1,
  },
};
const requests = {
  beta: {
    front: { cpu: '1', memory: '2Gi' },
    graphql: { cpu: '1', memory: '1Gi' },
  },
  canary: {
    front: { cpu: '500m', memory: '512Mi' },
    graphql: { cpu: '1', memory: '512Mi' },
  },
};
const values = {
  global: {
    serverConfig,
    app: { buildType: BUILD_TYPE },
    version: APP_VERSION,
    database: {
      gcloud: { enabled: cloudSql },
      host: database.hostname,
      port: database.port || '5432',
    },
    ingress: {
      enabled: true,
      hosts,
      annotations: {
        'kubernetes.io/ingress.class': 'gce',
        'kubernetes.io/ingress.allow-http': 'true',
        'kubernetes.io/ingress.global-static-ip-name': STATIC_IP_NAME,
      },
    },
  },
  front: {
    image: { tag: imageTag },
    replicaCount: replicas[BUILD_TYPE]?.front ?? 1,
    serviceAccount,
    nodeSelector,
    resources: { requests: requests[BUILD_TYPE]?.front ?? {} },
    ...(cloudSql
      ? {
          services: Object.fromEntries(
            ['web', 'sync', 'renderer'].map(name => [
              name,
              { annotations: neg },
            ])
          ),
        }
      : {}),
  },
  graphql: {
    image: { tag: imageTag },
    replicaCount: replicas[BUILD_TYPE]?.graphql ?? 1,
    serviceAccount,
    nodeSelector,
    resources: { requests: requests[BUILD_TYPE]?.graphql ?? {} },
    ...(cloudSql ? { service: { annotations: neg } } : {}),
  },
  worker: { image: { tag: imageTag } },
  ...(cloudSql
    ? {
        'cloud-sql-proxy': {
          database: { connectionName: GCLOUD_CONNECTION_NAME },
          serviceAccount: {
            annotations: {
              'iam.gke.io/gcp-service-account': CLOUD_SQL_IAM_ACCOUNT,
            },
          },
          nodeSelector: {
            'iam.gke.io/gke-metadata-server-enabled': 'true',
            ...(BUILD_TYPE === 'beta' ? nodeSelector : {}),
          },
        },
      }
    : {}),
};

const directory = mkdtempSync(join(tmpdir(), 'affine-deploy-'));
try {
  const valuesFile = join(directory, 'values.json');
  writeFileSync(valuesFile, JSON.stringify(values), { mode: 0o600 });
  const args = [
    'upgrade',
    '--install',
    'affine',
    '.github/helm/affine',
    '--namespace',
    namespace,
    '--values',
    valuesFile,
    '--timeout',
    '10m',
  ];
  // Helm dry-run output includes Secrets; validate it without logging the manifests.
  execFileSync('helm', [...args, '--dry-run', '--hide-secret'], {
    stdio: ['inherit', 'ignore', 'inherit'],
  });
  execFileSync('helm', [...args, '--atomic'], { stdio: 'inherit' });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
