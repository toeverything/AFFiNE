import { Button } from '@/ui/button';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useAppState } from '@/providers/app-state-provider';
import { useConfirm } from '@/providers/ConfirmProvider';
import { useRouter } from 'next/router';
import useCurrentPageMeta from '@/hooks/use-current-page-meta';
import { useTranslation } from 'react-i18next';

export const TrashButtonGroup = () => {
  const { permanentlyDeletePage } = usePageHelper();
  const { currentWorkspaceId } = useAppState();
  const { toggleDeletePage } = usePageHelper();
  const { confirm } = useConfirm();
  const router = useRouter();
  const { id = '' } = useCurrentPageMeta() || {};
  const { t } = useTranslation();
  return (
    <>
      <Button
        bold={true}
        shape="round"
        style={{ marginRight: '24px' }}
        onClick={() => {
          toggleDeletePage(id);
        }}
      >
        {t('Restore it')}
      </Button>
      <Button
        bold={true}
        shape="round"
        type="danger"
        onClick={() => {
          confirm({
            title: t('TrashButtonGroupTitle'),
            content: t('TrashButtonGroupDescription'),
            confirmText: t('Delete'),
            confirmType: 'danger',
          }).then(confirm => {
            if (confirm) {
              router.push(`/workspace/${currentWorkspaceId}/all`);
              permanentlyDeletePage(id);
            }
          });
        }}
      >
        {t('Delete permanently')}
      </Button>
    </>
  );
};

export default TrashButtonGroup;
