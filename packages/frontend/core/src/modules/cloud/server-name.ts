export const DEFAULT_SELF_HOSTED_SERVER_NAME = 'AFFiNE Self-hosted';

export function getSelfHostedServerName(serverName?: string | null) {
  return serverName && serverName !== DEFAULT_SELF_HOSTED_SERVER_NAME
    ? `${DEFAULT_SELF_HOSTED_SERVER_NAME} (${serverName})`
    : DEFAULT_SELF_HOSTED_SERVER_NAME;
}
