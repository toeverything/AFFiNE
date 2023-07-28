import { spawnSync } from 'node:child_process';

spawnSync('yarn', ['-T', 'run', 'dev-plugin', '--plugin', 'bookmark'], {
  stdio: 'inherit',
  shell: true,
});

spawnSync('yarn', ['-T', 'run', 'dev-plugin', '--plugin', 'hello-world'], {
  stdio: 'inherit',
  shell: true,
});

spawnSync('yarn', ['-T', 'run', 'dev-plugin', '--plugin', 'copilot'], {
  stdio: 'inherit',
  shell: true,
});
