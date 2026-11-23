import type { TransformerMiddleware } from '@blocksuite/store';

export const FULL_FILE_PATH_KEY = 'fullFilePath';

/**
 * Middleware to set the full file path of the imported file
 * @param filePath - The full file path of the imported file
 * @returns A TransformerMiddleware that sets the full file path of the imported file
 */
export const filePathMiddleware = (filePath: string): TransformerMiddleware => {
  return ({ adapterConfigs }) => {
    adapterConfigs.set(FULL_FILE_PATH_KEY, filePath);
  };
};
