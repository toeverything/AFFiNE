import type { AppConfig } from '../config/env.js';
import type {
  HealthPort,
  HealthStatus,
  ServerInfo,
  ServerInfoPort,
} from '../domain/health.js';
import type { MosaicStore } from '../domain/ports.js';

export class HealthService implements ServerInfoPort, HealthPort {
  constructor(
    private readonly config: AppConfig,
    private readonly store?: MosaicStore
  ) {}

  getServerInfo(): ServerInfo {
    return {
      name: this.config.MOSAIC_SERVER_NAME,
      version: this.config.MOSAIC_SERVER_VERSION,
      compatibility: this.config.MOSAIC_COMPAT_VERSION,
      message: 'Mosaic Server',
      flavor: this.config.flavor,
      type: this.config.deploymentType,
      features: [...this.config.MOSAIC_FEATURES],
    };
  }

  liveness(): HealthStatus {
    return {
      status: 'ok',
      checks: { process: 'up' },
    };
  }

  async readiness(): Promise<HealthStatus> {
    const checks: Record<string, 'up' | 'down' | 'skipped'> = {
      process: 'up',
      postgres: 'skipped',
      redis: this.config.REDIS_URL ? 'skipped' : 'skipped',
    };

    if (!this.store) {
      return { status: 'ok', checks };
    }

    if (this.store.kind === 'memory') {
      checks.postgres = 'skipped';
      return { status: 'ok', checks };
    }

    try {
      checks.postgres = (await this.store.ping()) ? 'up' : 'down';
    } catch {
      checks.postgres = 'down';
    }

    const status = checks.postgres === 'down' ? 'error' : 'ok';
    return { status, checks };
  }
}
