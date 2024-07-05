import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { TelemetryWorkspaceContextService } from '@affine/core/modules/telemetry/services/telemetry';
import { mixpanel } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { ImportIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';

import type { DocCollection } from '../../shared';
import { MenuItem } from '../app-sidebar';
import { usePageHelper } from '../blocksuite/block-suite-page-list/utils';

const ImportPage = ({ docCollection }: { docCollection: DocCollection }) => {
  const t = useI18n();
  const { importFile } = usePageHelper(docCollection);
  const telemetry = useService(TelemetryWorkspaceContextService);

  const onImportFile = useAsyncCallback(async () => {
    const options = await importFile();
    const page = telemetry.getPageContext();
    if (options.isWorkspaceFile) {
      mixpanel.track('WorkspaceCreated', {
        page,
        segment: 'navigation panel',
        module: 'doc list header',
        control: 'import button',
        type: 'imported workspace',
      });
    } else {
      mixpanel.track('DocCreated', {
        page,
        segment: 'navigation panel',
        module: 'doc list header',
        control: 'import button',
        type: 'imported doc',
        // category
      });
    }
  }, [importFile, telemetry]);

  return (
    <MenuItem icon={<ImportIcon />} onClick={onImportFile}>
      {t['Import']()}
    </MenuItem>
  );
};

export default ImportPage;
