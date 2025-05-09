import {
  type DialogComponentProps,
  type GLOBAL_DIALOG_SCHEMA,
  GlobalDialogService,
  WorkspaceDialogService,
} from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { useLiveData, useService } from '@toeverything/infra';

import { ChangePasswordDialog } from './change-password';
import { CollectionEditorDialog } from './collection-editor';
import { CreateWorkspaceDialog } from './create-workspace';
import { DocInfoDialog } from './doc-info';
import { EnableCloudDialog } from './enable-cloud';
import { ImportDialog } from './import';
import { ImportTemplateDialog } from './import-template';
import { ImportWorkspaceDialog } from './import-workspace';
import { CollectionSelectorDialog } from './selectors/collection';
import { DateSelectorDialog } from './selectors/date';
import { DocSelectorDialog } from './selectors/doc';
import { TagSelectorDialog } from './selectors/tag';
import { SettingDialog } from './setting';
import { SignInDialog } from './sign-in';
import { VerifyEmailDialog } from './verify-email';

const GLOBAL_DIALOGS = {
  'create-workspace': CreateWorkspaceDialog,
  'import-workspace': ImportWorkspaceDialog,
  'import-template': ImportTemplateDialog,
  'sign-in': SignInDialog,
  'change-password': ChangePasswordDialog,
  'verify-email': VerifyEmailDialog,
  'enable-cloud': EnableCloudDialog,
} satisfies {
  [key in keyof GLOBAL_DIALOG_SCHEMA]?: React.FC<
    DialogComponentProps<GLOBAL_DIALOG_SCHEMA[key]>
  >;
};

const WORKSPACE_DIALOGS = {
  'doc-info': DocInfoDialog,
  'collection-editor': CollectionEditorDialog,
  'tag-selector': TagSelectorDialog,
  'doc-selector': DocSelectorDialog,
  'collection-selector': CollectionSelectorDialog,
  'date-selector': DateSelectorDialog,
  setting: SettingDialog,
  import: ImportDialog,
} satisfies {
  [key in keyof WORKSPACE_DIALOG_SCHEMA]?: React.FC<
    DialogComponentProps<WORKSPACE_DIALOG_SCHEMA[key]>
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
    </>
  );
};

export const WorkspaceDialogs = () => {
  const workspaceDialogService = useService(WorkspaceDialogService);
  const dialogs = useLiveData(workspaceDialogService.dialogs$);
  return (
    <>
      {dialogs.map(dialog => {
        const DialogComponent =
          WORKSPACE_DIALOGS[dialog.type as keyof typeof WORKSPACE_DIALOGS];
        if (!DialogComponent) {
          return null;
        }
        return (
          <DialogComponent
            key={dialog.id}
            {...(dialog.props as any)}
            close={(result?: unknown) => {
              workspaceDialogService.close(dialog.id, result);
            }}
          />
        );
      })}
    </>
  );
};
