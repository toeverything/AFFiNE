import { Outlet } from 'react-router-dom';

import { AllWorkspaceModals } from '../components/providers/modal-provider';

export const RootWrapper = () => {
  return (
    <>
      <AllWorkspaceModals />
      <Outlet />
    </>
  );
};
