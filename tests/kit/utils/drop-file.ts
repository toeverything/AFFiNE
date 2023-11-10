import type { Page } from '@playwright/test';

export const dropFile = async (
  page: Page,
  selector: string,
  fileContent: Buffer | string,
  fileName: string,
  fileType = ''
) => {
  const buffer =
    typeof fileContent === 'string'
      ? Buffer.from(fileContent, 'utf-8')
      : fileContent;

  const dataTransfer = await page.evaluateHandle(
    async ({ bufferData, localFileName, localFileType }) => {
      const dt = new DataTransfer();

      const blobData = await fetch(bufferData).then(res => res.blob());

      const file = new File([blobData], localFileName, { type: localFileType });
      dt.items.add(file);
      return dt;
    },
    {
      bufferData: `data:application/octet-stream;base64,${buffer.toString(
        'base64'
      )}`,
      localFileName: fileName,
      localFileType: fileType,
    }
  );

  await page.dispatchEvent(selector, 'drop', { dataTransfer });
};
