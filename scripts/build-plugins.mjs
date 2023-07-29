import { spawn } from 'node:child_process';

const builtInPlugins = ['bookmark', 'hello-world', 'copilot', 'image-preview'];

for (const plugin of builtInPlugins) {
  spawn('yarn', ['-T', 'run', 'build-plugin', '--plugin', plugin], {
    stdio: 'inherit',
    shell: true,
  });
}
