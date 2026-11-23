import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildType, ROOT } from './make-env.js';

const {
  AFFINE_SIGNER_ADDR: address,
  AFFINE_SIGNER_TOKEN: token,
  AFFINE_SIGN_CLIENT_HASH: clientHash,
  WINDOWS_SIGNER_PUBLIC_CERT_BASE64: certificate,
} = process.env;
if (!address || !token || !clientHash || !certificate) {
  throw new Error(
    'Windows signer address, token, client hash and certificate are required'
  );
}

const client = path.join(ROOT, 'affine-sign-client.exe');
const cert = path.join(ROOT, 'windows-signer-public.cer');
if (!existsSync(client)) {
  const response = await fetch(
    `https://cdn.affine.pro/sign-client/${clientHash}`
  );
  if (!response.ok)
    throw new Error(`Signer download failed: ${response.status}`);
  await writeFile(client, Buffer.from(await response.arrayBuffer()));
}
await writeFile(cert, Buffer.from(certificate, 'base64'));

if (!process.env.SIGNTOOL) {
  const kits = path.join(
    process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Windows Kits',
    '10',
    'bin'
  );
  const versions = (await readdir(kits)).sort().reverse();
  const signtool = versions
    .map(version => path.join(kits, version, 'x64', 'signtool.exe'))
    .find(file => existsSync(file));
  if (!signtool) throw new Error(`signtool.exe was not found in ${kits}`);
  process.env.SIGNTOOL = signtool;
}

const workdir = path.join(
  ROOT,
  'out',
  ...(process.argv.includes('--installers') ? [buildType, 'make'] : [])
);
const files = (await readdir(workdir, { recursive: true }))
  .filter(file =>
    ['.exe', '.node', '.dll', '.msi'].includes(path.extname(file))
  )
  .map(file => `"${file}"`)
  .join(' ');
if (!files) throw new Error(`No Windows binaries found in ${workdir}`);
await new Promise<void>((resolve, reject) => {
  const signer = spawn(
    client,
    [
      '--server',
      address,
      '--token',
      token,
      '--workdir',
      workdir,
      '--files',
      files,
      '--cert',
      cert,
      '--plain-tcp',
    ],
    { stdio: 'inherit' }
  );
  signer.once('error', () =>
    reject(new Error('Could not start Windows signer'))
  );
  signer.once('exit', code => {
    if (code === 0) resolve();
    else reject(new Error(`Windows signing failed with exit code ${code}`));
  });
});
