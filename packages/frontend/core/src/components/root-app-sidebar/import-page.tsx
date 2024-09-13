import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ImportIcon } from '@blocksuite/icons/rc';
import type { DocCollection } from '@blocksuite/store';

import { MenuItem } from '../app-sidebar';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';

const ImportPage = ({ docCollection }: { docCollection: DocCollection }) => {
  const t = useI18n();
  const { importFile } = usePageHelper(docCollection);

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    track.$.navigationPanel.workspaceList[
      options.isWorkspaceFile ? 'createWorkspace' : 'createDoc'
    ]({
      control: 'import',
    });
  }, [importFile]);

  return (
    <MenuItem icon={<ImportIcon />} onClick={onImportFile}>
      {t['Import']()}
    </MenuItem>
  );
};

export default ImportPage;
