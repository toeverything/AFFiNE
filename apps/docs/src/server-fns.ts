'use server';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export async function saveFile(binary: any) {
  const data = new Uint8Array(binary);
  await writeFile(__dirname + 'pages' + '/binary', data);
}
