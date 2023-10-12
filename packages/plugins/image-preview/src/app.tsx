import type { Page } from '@blocksuite/store';

import { ImagePreviewModal } from './component';

export type AppProps = {
  page: Page;
};

export const App = ({ page }: AppProps) => {
  return <ImagePreviewModal pageId={page.id} workspace={page.workspace} />;
};
