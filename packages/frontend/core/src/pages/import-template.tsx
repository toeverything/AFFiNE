import { useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { ImportTemplateDialogService } from '../modules/import-template';

export const Component = () => {
  const importTemplateDialogService = useService(ImportTemplateDialogService);
  const [searchParams] = useSearchParams();
  const { jumpToIndex } = useNavigateHelper();
  useEffect(() => {
    importTemplateDialogService.dialog.open({
      templateName: searchParams.get('name') ?? '',
      snapshotUrl: searchParams.get('snapshotUrl') ?? '',
    });
  }, [importTemplateDialogService.dialog, jumpToIndex, searchParams]);
  // no ui for this route, just open the dialog
  return null;
};
