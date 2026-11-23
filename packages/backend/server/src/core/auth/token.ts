export const MCP_CREDENTIAL_TOKEN_PREFIX = 'aff_mcp_v1';

export function isLikelyJwt(token: string) {
  return (
    !token.startsWith(`${MCP_CREDENTIAL_TOKEN_PREFIX}.`) &&
    token.split('.').length === 3
  );
}
