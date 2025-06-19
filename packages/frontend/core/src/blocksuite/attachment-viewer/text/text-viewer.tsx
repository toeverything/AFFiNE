import { useEffect, useState } from 'react';
import type { AttachmentViewerProps } from '../types';
import { getAttachmentBlob } from '../utils';
import * as styles from '../viewer.css';

export function TextViewer({ model }: AttachmentViewerProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    (async () => {
      const blob = await getAttachmentBlob(model);
      if (blob) {
        const content = await blob.text();
        setText(content);
      }
    })().catch(console.error);
  }, [model]);

  return (
    <pre className={styles.viewer} style={{ padding: '12px', whiteSpace: 'pre-wrap' }}>
      {text}
    </pre>
  );
}
