import { MenuItem } from '@affine/component/app-sidebar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ImportIcon } from '@blocksuite/icons';

import type { BlockSuiteWorkspace } from '../../shared';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';

const ImportPage = ({
  blocksuiteWorkspace,
}: {
  blocksuiteWorkspace: BlockSuiteWorkspace;
}) => {
  const t = useAFFiNEI18N();
  const { importFile } = usePageHelper(blocksuiteWorkspace);
  return (
    <MenuItem icon={<ImportIcon />} onClick={importFile}>
      {t['Import']()}
    </MenuItem>
  );
};

export default ImportPage;
