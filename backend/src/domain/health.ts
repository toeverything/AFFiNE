export type DeploymentType = 'selfhosted' | 'cloud';
export type ServerFlavor = 'allinone' | 'api' | 'sync';

export interface ServerInfo {
  /** Product name shown to operators and probes. */
  name: string;
  /** Mosaic Server semver (this process). */
  version: string;
  /**
   * Wire-compat version advertised to the MIT client.
   * Must be >= 0.27.0 (`MIN_SUPPORTED_SERVER_VERSION` in the web app).
   */
  compatibility: string;
  message: string;
  flavor: ServerFlavor;
  type: DeploymentType;
  /** Enabled server-side feature flags (cutover). */
  features: string[];
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  checks: Record<string, 'up' | 'down' | 'skipped'>;
}

export interface ServerInfoPort {
  getServerInfo(): ServerInfo;
}

export interface HealthPort {
  liveness(): HealthStatus;
  readiness(): Promise<HealthStatus>;
}
