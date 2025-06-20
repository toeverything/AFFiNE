import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { getSingletonHighlighter } from 'shiki';

import type { AttachmentViewerProps } from '../types';
import { getAttachmentBlob } from '../utils';
import * as styles from '../viewer.css';

export function TextViewer({ model }: AttachmentViewerProps) {
  const [html, setHtml] = useState('');

  useEffect(() => {
    (async () => {
      const blob = await getAttachmentBlob(model);
      if (!blob) return;
      const content = await blob.text();

      const ext = model.props.name.split('.').pop()?.toLowerCase() ?? '';
      let lang = 'plaintext';
      try {
        const { bundledLanguagesInfo } = await import('shiki');
        const matched = bundledLanguagesInfo.find(info =>
          [info.id, info.name, ...(info.aliases ?? [])].includes(ext)
        );
        if (matched) {
          lang = matched.id;
        }
      } catch {
        // ignore
      }

      const highlighter = await getSingletonHighlighter({
        themes: ['light-plus', 'dark-plus'],
        langs: [lang],
      });
      const theme = document.documentElement.classList.contains('dark')
        ? 'dark-plus'
        : 'light-plus';
      const highlighted = highlighter.codeToHtml(content, { lang, theme });
      setHtml(highlighted);
    })().catch(console.error);
  }, [model]);

  return (
    <div
      className={clsx(styles.viewer, styles.scrollable)}
      style={{
        padding: '12px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
