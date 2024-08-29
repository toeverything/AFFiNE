import { Outlet } from 'react-router-dom';

import { AllWorkspaceModals } from '../providers/modal-provider';

export const RootWrapper = () => {
  return (
    <>
      <AllWorkspaceModals />
      <Outlet />
    </>
  );
};
