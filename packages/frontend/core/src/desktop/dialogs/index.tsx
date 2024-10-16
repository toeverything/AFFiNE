import { AuthModal } from '@affine/core/components/affine/auth';
import {
  type DialogComponentProps,
  type GLOBAL_DIALOG_SCHEMA,
  GlobalDialogService,
} from '@affine/core/modules/dialogs';
import { useLiveData, useService } from '@toeverything/infra';

import { CreateWorkspaceDialog } from './create-workspace';
import { ImportTemplateDialog } from './import-template';
import { ImportWorkspaceDialog } from './import-workspace';

const GLOBAL_DIALOGS = {
  'create-workspace': CreateWorkspaceDialog,
  'import-workspace': ImportWorkspaceDialog,
  'import-template': ImportTemplateDialog,
} satisfies {
  [key in keyof GLOBAL_DIALOG_SCHEMA]?: React.FC<
    DialogComponentProps<GLOBAL_DIALOG_SCHEMA[key]>
  >;
};

export const GlobalDialogs = () => {
  const globalDialogService = useService(GlobalDialogService);
  const dialogs = useLiveData(globalDialogService.dialogs$);
  return (
    <>
      {dialogs.map(dialog => {
        const DialogComponent =
          GLOBAL_DIALOGS[dialog.type as keyof typeof GLOBAL_DIALOGS];
        if (!DialogComponent) {
          return null;
        }
        return (
          <DialogComponent
            key={dialog.id}
            {...(dialog.props as any)}
            close={(result?: unknown) => {
              globalDialogService.close(dialog.id, result);
            }}
          />
        );
      })}

      <AuthModal />
    </>
  );
};
