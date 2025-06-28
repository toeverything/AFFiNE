import path from 'node:path';

import fs from 'fs-extra';

import { logger } from './logger';
import { mainRPC } from './main-rpc';

export async function openTempFile(data: number[], name: string) {
  try {
    const dir = await mainRPC.getPath('temp');
    const safeName = name.replace(/[\\/?:*"<>|]/g, '_');
    const filePath = path.join(dir, `affine-${Date.now()}-${safeName}`);
    await fs.writeFile(filePath, Buffer.from(data));
    await mainRPC.openPath(filePath);
    return filePath;
  } catch (err) {
    logger.error('openTempFile failed', err);
    throw err;
  }
}

export const fileHandlers = {
  openTempFile,
};
