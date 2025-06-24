import { Global, Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { AsyncCall, type AsyncVersionOf } from 'async-call-rpc';

import type { MainToHelper } from '../../shared/type';

@Injectable()
export class MainRpcService implements OnModuleInit {
  rpc: AsyncVersionOf<MainToHelper> | null = null;

  onModuleInit(): void {
    if (!process.parentPort) {
      console.error('[MainRpcService] parentPort is not available');
      return;
    }
    this.rpc = AsyncCall<MainToHelper>(null, {
      strict: {
        unknownMessage: false,
      },
      channel: {
        on(listener) {
          const f = (e: Electron.MessageEvent) => {
            listener(e.data);
          };
          process.parentPort.on('message', f);
          return () => {
            process.parentPort.off('message', f);
          };
        },
        send(data) {
          process.parentPort.postMessage(data);
        },
      },
      log: false,
    });
  }
}

@Global()
@Module({
  providers: [MainRpcService],
  exports: [MainRpcService],
})
export class MainRpcModule {}
