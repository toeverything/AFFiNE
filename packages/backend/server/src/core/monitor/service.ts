import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { metrics } from '../../base';

@Injectable()
export class MonitorService {
  protected logger = new Logger(MonitorService.name);

  @Cron(CronExpression.EVERY_MINUTE)
  async monitor() {
    const memoryUsage = process.memoryUsage();
    this.logger.log(
      `memory usage: rss: ${memoryUsage.rss}, heapTotal: ${memoryUsage.heapTotal}, heapUsed: ${memoryUsage.heapUsed}, external: ${memoryUsage.external}, arrayBuffers: ${memoryUsage.arrayBuffers}`
    );
    metrics.process.gauge('node_process_rss').record(memoryUsage.rss);
    metrics.process
      .gauge('node_process_heap_total')
      .record(memoryUsage.heapTotal);
    metrics.process
      .gauge('node_process_heap_used')
      .record(memoryUsage.heapUsed);
    metrics.process.gauge('node_process_external').record(memoryUsage.external);
    metrics.process
      .gauge('node_process_array_buffers')
      .record(memoryUsage.arrayBuffers);
  }
}
