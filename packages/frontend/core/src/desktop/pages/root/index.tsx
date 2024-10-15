import { Outlet } from 'react-router-dom';

import { AllDialogs } from '../../dialogs';

export const RootWrapper = () => {
  return (
    <>
      <AllDialogs />
      <Outlet />
    </>
  );
};
