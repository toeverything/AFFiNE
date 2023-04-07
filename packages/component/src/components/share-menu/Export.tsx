import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { FC } from 'react';
import { useRef } from 'react';

import { Button } from '../..';
import type { ShareMenuProps } from './index';
const Export: FC<ShareMenuProps> = props => {
  const contentParserRef = useRef<ContentParser>();
  return (
    <div>
      <div>Download a static copy of your page to share with others.</div>
      <Button
        onClick={() => {
          if (!contentParserRef.current) {
            contentParserRef.current = new ContentParser(props.currentPage);
          }
          return contentParserRef.current.onExportHtml();
        }}
      >
        Export to HTML
      </Button>
      <Button
        onClick={() => {
          if (!contentParserRef.current) {
            contentParserRef.current = new ContentParser(props.currentPage);
          }
          return contentParserRef.current.onExportMarkdown();
        }}
      >
        Export to Markdown
      </Button>
    </div>
  );
};

export default Export;
