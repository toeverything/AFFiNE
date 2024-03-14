import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ImportIcon } from '@blocksuite/icons';

import type { DocCollection } from '../../shared';
import { MenuItem } from '../app-sidebar';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';

const ImportPage = ({ docCollection }: { docCollection: DocCollection }) => {
  const t = useAFFiNEI18N();
  const { importFile } = usePageHelper(docCollection);
  return (
    <MenuItem icon={<ImportIcon />} onClick={importFile}>
      {t['Import']()}
    </MenuItem>
  );
};

export default ImportPage;
