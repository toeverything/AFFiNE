import { NotificationCenter } from '@affine/component';
import { Outlet } from 'react-router-dom';

import { GlobalDialogs } from '../../dialogs';
import { CustomThemeModifier } from './custom-theme';

export const RootWrapper = () => {
  return (
    <>
      <GlobalDialogs />
      <NotificationCenter />
      <Outlet />
      <CustomThemeModifier />
    </>
  );
};
