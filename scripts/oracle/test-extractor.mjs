import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = await mkdtemp(join(tmpdir(), 'affine-contract-extractor-'));
try {
  for (const path of [
    'packages/backend/server/src',
    'packages/common/graphql/src/schema.ts',
    'packages/common/realtime/src/index.ts',
    'tests/oracle-contracts/v0.27.5',
    'package.json',
    'yarn.lock',
    'scripts/oracle/extract-v0275-contracts.mjs',
  ]) {
    await mkdir(dirname(join(temporary, path)), { recursive: true });
    await cp(join(root, path), join(temporary, path), { recursive: true });
  }
  const run = (...args) => {
    const result = spawnSync(
      process.execPath,
      [join(temporary, 'scripts/oracle/extract-v0275-contracts.mjs'), ...args],
      {
        env: {
          ...process.env,
          AFFINE_NODE_MODULES_ROOT:
            process.env.AFFINE_NODE_MODULES_ROOT ?? root,
        },
        encoding: 'utf8',
      }
    );
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    return result.stdout;
  };
  run('--check');
  const mail = join(
    temporary,
    'tests/oracle-contracts/v0.27.5/mails/SignIn.html'
  );
  const original = await readFile(mail);
  await writeFile(mail, Buffer.concat([original, Buffer.from('x')]));
  assert.throws(() => run('--check'), /mails\/SignIn\.html/);
  await writeFile(mail, original);
  const unknown = join(
    temporary,
    'packages/backend/server/src/core/sync/oracle-unresolved.ts'
  );
  await writeFile(
    unknown,
    'function unsafe(socket:any,event:string){socket.emit(event,{});}\n'
  );
  assert.throws(() => run('--check'), /Unresolved wire emit/);
  await rm(unknown);
  const definitions = join(
    temporary,
    'packages/backend/server/src/base/error/def.ts'
  );
  const text = await readFile(definitions, 'utf8');
  assert.ok(text.includes('bad_request: HttpStatus.BAD_REQUEST'));
  await writeFile(
    definitions,
    text.replace(
      'bad_request: HttpStatus.BAD_REQUEST',
      'bad_request: HttpStatus.CONFLICT'
    )
  );
  assert.throws(() => run('--check'), /Contract drift/);
  const staticFile = join(
    temporary,
    'packages/backend/server/src/core/selfhost/static.ts'
  );
  await writeFile(
    staticFile,
    (await readFile(staticFile, 'utf8')) +
      '\nfunction extra(app:any,basePath:string){app.get(basePath+"/oracle-added",()=>{});}\n'
  );
  run();
  const catalog = JSON.parse(
    await readFile(
      join(temporary, 'tests/oracle-contracts/v0.27.5/error-catalog.json'),
      'utf8'
    )
  );
  assert.equal(catalog.errors.find(e => e.name === 'BAD_REQUEST').status, 409);
  const routes = JSON.parse(
    await readFile(
      join(temporary, 'tests/oracle-contracts/v0.27.5/rest-routes.json'),
      'utf8'
    )
  );
  for (const path of [
    '/admin',
    '/graphql',
    '/socket.io',
    '/*path',
    '/admin/index.html',
    '/index.html',
    '/oracle-added',
  ])
    assert.ok(
      routes.mounts.some(r => r.full_path === path),
      `missing mount ${path}`
    );
  assert.ok(
    !routes.mounts.some(r =>
      r.implementation.includes('app.get(TelemetryService')
    ),
    'Nest DI lookup is not an HTTP route'
  );
  assert.ok(
    !routes.mounts.some(
      r =>
        r.file === 'packages/backend/server/src/server.ts' && r.method === 'GET'
    ),
    'Nest app.get token lookups must be excluded'
  );
  assert.ok(
    routes.mounts.some(r => r.flavor === 'selfhost' && r.full_path === '/admin')
  );
  assert.ok(
    routes.mounts.some(r => r.flavor === 'standard' && r.full_path === '/admin')
  );
  run('--check');
  console.log(
    'extractor regressions: byte tamper RED, unresolved emit RED, source status drift RED, AST status change 409, imperative mounts complete, re-extract/check GREEN'
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
