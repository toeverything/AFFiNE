import { GlobalDialogService } from '@affine/core/modules/dialogs';
import type { DocMode } from '@blocksuite/affine/model';
import { useService } from '@toeverything/infra';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useNavigateHelper } from '../../../components/hooks/use-navigate-helper';

/**
 * /template/import page, only for web
 *
 * no ui for this route, just open the dialog
 */
export const Component = () => {
  const globalDialogService = useService(GlobalDialogService);
  const [searchParams] = useSearchParams();
  const { jumpToIndex } = useNavigateHelper();
  useEffect(() => {
    const id = globalDialogService.open('import-template', {
      templateName: searchParams.get('name') ?? '',
      templateMode: (searchParams.get('mode') as DocMode) ?? 'page',
      snapshotUrl: searchParams.get('snapshotUrl') ?? '',
    });

    return () => {
      globalDialogService.close(id);
    };
  }, [globalDialogService, jumpToIndex, searchParams]);
  // no ui for this route, just open the dialog
  return null;
};
