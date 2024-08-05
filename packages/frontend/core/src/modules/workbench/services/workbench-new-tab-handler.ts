import { popupWindow } from '@affine/core/utils';
import { apis } from '@affine/electron-api';
import { createIdentifier } from '@toeverything/infra';
import { parsePath, type To } from 'history';

export type WorkbenchNewTabHandler = (option: {
  basename: string;
  to: To;
  show: boolean;
}) => void;

export const WorkbenchNewTabHandler = createIdentifier<WorkbenchNewTabHandler>(
  'WorkbenchNewTabHandler'
);

export const BrowserWorkbenchNewTabHandler: WorkbenchNewTabHandler = ({
  basename,
  to,
}) => {
  const link =
    basename +
    (typeof to === 'string' ? to : `${to.pathname}${to.search}${to.hash}`);
  popupWindow(link);
};

export const DesktopWorkbenchNewTabHandler: WorkbenchNewTabHandler = ({
  basename,
  to,
}) => {
  const path = typeof to === 'string' ? parsePath(to) : to;
  apis?.ui
    .addTab({
      basename,
      view: { path },
      show: false,
    })
    .catch(console.error);
};
