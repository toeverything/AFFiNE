import { Confirm, MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';
import { useState } from 'react';

import { usePageMetaHelper } from '../../../hooks/use-page-meta';
import type { BlockSuiteWorkspace } from '../../../shared';
import { toast } from '../../../utils';

export const MoveToTrash = ({
  currentMeta,
  blockSuiteWorkspace,
  testId,
}: {
  currentMeta: PageMeta;
  blockSuiteWorkspace: BlockSuiteWorkspace;
  testId?: string;
}) => {
  const { t } = useTranslation();

  const { setPageMeta } = usePageMetaHelper(blockSuiteWorkspace);
  const [open, setOpen] = useState(false);
  return (
    <>
      <MenuItem
        data-testid={testId}
        onClick={() => {
          setOpen(true);
        }}
        icon={<DeleteTemporarilyIcon />}
      >
        {t('Move to Trash')}
      </MenuItem>
      <Confirm
        title={t('Delete page?')}
        content={t('will be moved to Trash', {
          title: currentMeta.title || 'Untitled',
        })}
        confirmText={t('Delete')}
        confirmType="danger"
        open={open}
        onConfirm={() => {
          toast(t('Moved to Trash'));
          setOpen(false);
          setPageMeta(currentMeta.id, {
            trash: true,
            trashDate: +new Date(),
          });
        }}
        onClose={() => {
          setOpen(false);
        }}
        onCancel={() => {
          setOpen(false);
        }}
      />
    </>
  );
};
