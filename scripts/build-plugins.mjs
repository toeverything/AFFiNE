import { spawn } from 'node:child_process';

spawn('yarn', ['-T', 'run', 'dev-plugin', '--plugin', 'bookmark'], {
  stdio: 'inherit',
  shell: true,
});

spawn('yarn', ['-T', 'run', 'dev-plugin', '--plugin', 'hello-world'], {
  stdio: 'inherit',
  shell: true,
});

spawn('yarn', ['-T', 'run', 'dev-plugin', '--plugin', 'copilot'], {
  stdio: 'inherit',
  shell: true,
});
