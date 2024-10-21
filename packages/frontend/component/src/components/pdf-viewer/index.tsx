import type { ReactElement } from 'react';

import { Titlebar } from './titlebar';

export const PDFViewer = (): ReactElement => {
  return (
    <>
      <Titlebar id={'0'} name={'AFFiNE'} size={10} ext=".pdf" zoom={100} />
      <div>{'PDF Viewer'}</div>
      <div>{'PDF ...'}</div>
    </>
  );
};
