import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ModuleScanner } from '../../nestjs';
import { getJobHandlerMetadata, JOB_SIGNAL } from './def';

interface JobHandler {
  name: string;
  fn: (payload: any) => Promise<JOB_SIGNAL | undefined>;
}

@Injectable()
export class JobHandlerScanner implements OnModuleInit {
  private readonly handlers: Record<string, JobHandler> = {};
  private readonly logger = new Logger(JobHandlerScanner.name);

  constructor(private readonly scanner: ModuleScanner) {}

  async onModuleInit() {
    this.scan();
  }

  getHandler(jobName: JobName): JobHandler | undefined {
    return this.handlers[jobName];
  }

  private scan() {
    const providers = this.scanner.getAtInjectables();

    providers.forEach(wrapper => {
      const { instance, name } = wrapper;
      if (!instance || wrapper.isAlias) {
        return;
      }

      const methods = this.scanner.getAllMethodNames(instance);

      methods.forEach(method => {
        const fn = instance[method];

        let jobNames = getJobHandlerMetadata(instance[method]);

        if (jobNames.length === 0) {
          return;
        }

        const signature = `${name}.${method}`;

        if (typeof fn !== 'function') {
          throw new Error(`Job handler [${signature}] is not a function.`);
        }

        if (!wrapper.isDependencyTreeStatic()) {
          throw new Error(
            `Provider [${name}] could not be RequestScoped or TransientScoped injectable if it contains job handlers.`
          );
        }

        jobNames.forEach(jobName => {
          if (this.handlers[jobName]) {
            throw new Error(
              `Job handler ${jobName} already defined in [${this.handlers[jobName].name}].`
            );
          }

          this.handlers[jobName] = {
            name: signature,
            fn: (payload: any) => {
              // NOTE(@forehalo):
              //   we might create spies on the job handlers when testing,
              //   avoid reusing `fn` variable to fail the spies or stubs
              return instance[method].bind(instance)(payload);
            },
          };

          this.logger.log(`Job handler registered [${jobName}] (${signature})`);
        });
      });
    });
  }
}
