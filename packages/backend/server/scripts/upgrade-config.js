import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config as loadEnv } from 'dotenv';

const aliases = [
  ['mailer', 'SMTP.host', 'MAILER_HOST'],
  ['mailer', 'SMTP.ignoreTLS', 'MAILER_IGNORE_TLS', 'boolean'],
  ['mailer', 'SMTP.name', 'MAILER_SERVERNAME'],
  ['mailer', 'SMTP.password', 'MAILER_PASSWORD'],
  ['mailer', 'SMTP.port', 'MAILER_PORT', 'integer'],
  ['mailer', 'SMTP.sender', 'MAILER_SENDER'],
  ['mailer', 'SMTP.username', 'MAILER_USER'],
  ['redis', 'db', 'REDIS_SERVER_DATABASE', 'integer'],
  ['redis', 'host', 'REDIS_SERVER_HOST'],
  ['redis', 'password', 'REDIS_SERVER_PASSWORD'],
  ['redis', 'port', 'REDIS_SERVER_PORT', 'integer'],
  ['redis', 'username', 'REDIS_SERVER_USERNAME'],
  ['server', 'externalUrl', 'AFFINE_SERVER_EXTERNAL_URL'],
  ['server', 'host', 'AFFINE_SERVER_HOST'],
  ['server', 'https', 'AFFINE_SERVER_HTTPS', 'boolean'],
  ['server', 'listenAddr', 'LISTEN_ADDR'],
  ['server', 'path', 'AFFINE_SERVER_SUB_PATH'],
  ['server', 'port', 'AFFINE_SERVER_PORT', 'integer'],
  ['telemetry', 'ga4.apiSecret', 'GA4_API_SECRET'],
  ['telemetry', 'ga4.measurementId', 'GA4_MEASUREMENT_ID'],
];

// TODO(0.27.5): Remove this upgrade after old self-host config files and mounts are retired.
export function upgradeConfig(
  appRoot = process.cwd(),
  homeDir = homedir(),
  deploymentType
) {
  loadEnv({ path: path.join(appRoot, '.env'), quiet: true });
  loadEnv({ path: path.join(homeDir, '.affine/config/.env'), quiet: true });
  deploymentType ??= process.env.DEPLOYMENT_TYPE;
  const appPath = path.join(appRoot, 'config.json');
  const homePath = path.join(homeDir, '.affine/config/config.json');
  const configPath = fs.existsSync(appPath)
    ? appPath
    : fs.existsSync(homePath) || fs.existsSync(path.dirname(homePath))
      ? homePath
      : appPath;
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    : {};
  let changed = false;
  if (!config.deployment?.type) {
    if (deploymentType && !['affine', 'selfhosted'].includes(deploymentType)) {
      throw new Error(`Invalid DEPLOYMENT_TYPE: ${deploymentType}`);
    }
    config.deployment = {
      ...config.deployment,
      type: deploymentType === 'affine' ? 'cloud' : 'selfhosted',
    };
    changed = true;
  }
  for (const [module, key, alias, type] of aliases) {
    const value = process.env[alias];
    if (!value) continue;
    const current = config[module] ?? {};
    const parts = key.split('.');
    const nested = parts
      .slice(0, -1)
      .reduce((value, part) => value?.[part], current);
    if (
      Object.hasOwn(current, key) ||
      Object.hasOwn(nested ?? {}, parts.at(-1))
    ) {
      continue;
    }
    const parsed =
      type === 'boolean'
        ? value === '1' || value.toLowerCase() === 'true'
        : type === 'integer'
          ? Number.parseInt(value)
          : value;
    if (type === 'integer' && Number.isNaN(parsed)) continue;
    config[module] = { ...current, [key]: parsed };
    changed = true;
  }
  if (!changed) return;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tempPath = `${configPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', {
      mode: 0o600,
    });
    fs.renameSync(tempPath, configPath);
  } catch (error) {
    if (
      configPath === appPath &&
      ['EACCES', 'EROFS', 'EBUSY'].includes(error.code)
    ) {
      return;
    }
    throw error;
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  upgradeConfig();
}
