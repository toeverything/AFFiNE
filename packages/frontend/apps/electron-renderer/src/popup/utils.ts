import { useEffect, useState } from 'react';

export const useBlobUrl = (buffer?: Buffer) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!buffer) {
      return;
    }
    const url = URL.createObjectURL(new Blob([buffer]));
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [buffer]);

  return blobUrl;
};
