import { readFile, writeFile } from 'node:fs/promises';

import { Injectable, Logger } from '@nestjs/common';

import { BackendRuntimeProvider } from '../../core/backend-runtime';

@Injectable()
export class RootSourceCommand {
  private readonly logger = new Logger(RootSourceCommand.name);

  constructor(private readonly runtime: BackendRuntimeProvider) {}

  async inspect(
    workspaceId: string,
    output: string,
    historyTimestamps: string[] = [],
    backupFiles: string[] = []
  ) {
    const backups = await Promise.all(
      backupFiles.map(async file => JSON.parse(await readFile(file, 'utf8')))
    );
    const report = await this.runtime.workspaceRootMaintenanceV1({
      command: 'inspect',
      workspaceId,
      historyTimestamps,
      backups,
    });
    await writeFile(output, JSON.stringify(report, null, 2) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    this.logger.log(`Root source report saved to ${output}`);
  }

  async apply(reportFile: string) {
    const report = JSON.parse(await readFile(reportFile, 'utf8'));
    const result = await this.runtime.workspaceRootMaintenanceV1({
      command: 'apply',
      report,
    });
    this.logger.log(JSON.stringify(result));
  }

  async notify(workspaceId: string) {
    const result = await this.runtime.workspaceRootMaintenanceV1({
      command: 'notify',
      workspaceId,
    });
    this.logger.log(JSON.stringify(result));
  }
}
