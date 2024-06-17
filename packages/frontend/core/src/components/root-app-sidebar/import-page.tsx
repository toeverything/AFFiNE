import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { mixpanel } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ImportIcon } from '@blocksuite/icons/rc';

import type { DocCollection } from '../../shared';
import { MenuItem } from '../app-sidebar';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';

const ImportPage = ({ docCollection }: { docCollection: DocCollection }) => {
  const t = useAFFiNEI18N();
  const { importFile } = usePageHelper(docCollection);

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    if (options.isWorkspaceFile) {
      mixpanel.track('WorkspaceCreated', {
        page: 'doc library',
        segment: 'navigation panel',
        module: 'doc list header',
        control: 'import button',
        type: 'imported workspace',
      });
    } else {
      mixpanel.track('DocCreated', {
        page: 'doc library',
        segment: 'navigation panel',
        module: 'doc list header',
        control: 'import button',
        type: 'imported doc',
        // category
      });
    }
  }, [importFile]);

  return (
    <MenuItem icon={<ImportIcon />} onClick={onImportFile}>
      {t['Import']()}
    </MenuItem>
  );
};

export default ImportPage;
