import {
  type DialogComponentProps,
  type GLOBAL_DIALOG_SCHEMA,
  GlobalDialogService,
  WorkspaceDialogService,
} from '@affine/core/modules/dialogs';
import type { WORKSPACE_DIALOG_SCHEMA } from '@affine/core/modules/dialogs/constant';
import { useLiveData, useService } from '@toeverything/infra';

import { CollectionSelectorDialog } from './selectors/collection-selector';
import { DateSelectorDialog } from './selectors/date-selector';
import { DocSelectorDialog } from './selectors/doc-selector';
import { TagSelectorDialog } from './selectors/tag-selector';
import { SettingDialog } from './setting';
import { SignInDialog } from './sign-in';

const GLOBAL_DIALOGS = {
  //   'create-workspace': CreateWorkspaceDialog,
  //   'import-workspace': ImportWorkspaceDialog,
  //   'import-template': ImportTemplateDialog,
  //   import: ImportDialog,
  'sign-in': SignInDialog,
} satisfies {
  [key in keyof GLOBAL_DIALOG_SCHEMA]?: React.FC<
    DialogComponentProps<GLOBAL_DIALOG_SCHEMA[key]>
  >;
};

const WORKSPACE_DIALOGS = {
  //   'doc-info': DocInfoDialog,
  //   'collection-editor': CollectionEditorDialog,
  'tag-selector': TagSelectorDialog,
  'doc-selector': DocSelectorDialog,
  'collection-selector': CollectionSelectorDialog,
  'date-selector': DateSelectorDialog,
  setting: SettingDialog,
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
