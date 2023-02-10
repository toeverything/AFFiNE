/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import fs from 'fs';
import path from 'path';
// TODO: use https://github.com/quicktype/quicktype#installation instead
import { compileFromFile } from 'json-schema-to-typescript';
import { cd } from 'zx/core';

const projectRoot = path.join(__dirname, '..', '..');
const tsTypingsFolder = path.join(
  projectRoot,
  'packages/data-center/src/provider/tauri-ipc/ipc/types'
);

/**
 * 1. generate JSONSchema using rs crate `schemars`, this happened on rs side script `src-tauri/examples/generate-jsonschema.rs`
 */
cd('./src-tauri');
try {
  fs.mkdirSync(tsTypingsFolder);
} catch {}
await $`cargo run --example generate-jsonschema`;

/**
 * 2. generate TS from JSON schema, this is efficient on NodeJS side.
 */
const fileNames = fs.readdirSync(tsTypingsFolder);
const jsonSchemaFilePaths = fileNames
  .filter(fileName => fileName.endsWith('.json'))
  .map(fileName => path.join(tsTypingsFolder, fileName));

await Promise.all(
  jsonSchemaFilePaths.map(
    async fileName =>
      await compileFromFile(fileName).then(tsContent =>
        fs.writeFileSync(fileName.replace('.json', '.ts'), tsContent)
      )
  )
);

/**
 * 3. fix eslint error on generated ts files
 */
cd(path.join(projectRoot, 'packages/data-center'));
await $`eslint ${tsTypingsFolder} --ext ts --fix`;

/**
 * 4. // TODO: parse all #[tauri::command] and generate ts method code
 */
