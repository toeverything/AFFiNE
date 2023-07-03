import { setTimeout } from 'node:timers/promises';

import fs from 'fs-extra';

export async function removeWithRetry(
  filePath: string,
  maxRetries = 5,
  delay = 500
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.remove(filePath);
      console.log(`File ${filePath} successfully deleted.`);
      return true;
    } catch (err: any) {
      if (err.code === 'EBUSY' || err.code === 'EPERM') {
        console.log(`File ${filePath} is busy or locked, retrying...`);
        await setTimeout(delay);
      } else {
        console.error(`Failed to delete file ${filePath}:`, err);
      }
    }
  }
  // Add a return statement here to ensure that a value is always returned
  return false;
}
