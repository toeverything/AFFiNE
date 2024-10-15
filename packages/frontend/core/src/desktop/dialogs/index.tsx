import { NotificationCenter } from '@affine/component';
import { AuthModal } from '@affine/core/components/affine/auth';

import { CreateWorkspaceDialog } from './create-workspace';
import { CustomThemeModifier } from './custom-theme';
import { ImportTemplateDialog } from './import-template';

export const AllDialogs = () => {
  return (
    <>
      <NotificationCenter />
      <CustomThemeModifier />
      <ImportTemplateDialog />
      <CreateWorkspaceDialog />
      <AuthModal />
    </>
  );
};
