import { spawn } from 'node:child_process';

const builtInPlugins = ['bookmark', 'hello-world', 'copilot', 'image-preview'];

for (const plugin of builtInPlugins) {
  const cp = spawn('yarn', ['-T', 'run', 'dev-plugin', '--plugin', plugin], {
    stdio: 'inherit',
    shell: true,
  });
  cp.on('exit', code => {
    if (code !== 0) {
      process.exit(code);
    }
  });
}
