import { BundleCommand } from '@affine-tools/cli/bundle';
import { Package } from '@affine-tools/utils/workspace';

export default async () => {
  await new Promise<void>((resolve, reject) => {
    BundleCommand.dev(new Package('@affine/web'), {
      onListening: server => {
        // dev server has already started
        if (server.options.port !== 8080) {
          server.compiler.close(reject);
          server.stop().catch(reject);
          resolve();
        } else {
          server.middleware?.waitUntilValid?.(stats => {
            if (stats?.hasErrors()) {
              reject(new Error('Webpack build failed'));
            } else {
              resolve();
            }
          });
        }
      },
    }).catch(reject);
  });
  console.log('Dev server started');
};
