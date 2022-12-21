import { Button } from '@/ui/button';
import { usePageHelper } from '@/hooks/use-page-helper';
import { useAppState } from '@/providers/app-state-provider';
import { useConfirm } from '@/providers/confirm-provider';
import { useRouter } from 'next/router';
import useCurrentPageMeta from '@/hooks/use-current-page-meta';

export const TrashButtonGroup = () => {
  const { permanentlyDeletePage } = usePageHelper();
  const { currentWorkspaceId } = useAppState();
  const { toggleDeletePage } = usePageHelper();
  const { confirm } = useConfirm();
  const router = useRouter();
  const { id = '' } = useCurrentPageMeta() || {};

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
        Restore it
      </Button>
      <Button
        bold={true}
        shape="round"
        type="danger"
        onClick={() => {
          confirm({
            title: 'Permanently delete',
            content:
              "Once deleted, you can't undo this action. Do you confirm?",
            confirmText: 'Delete',
            confirmType: 'danger',
          }).then(confirm => {
            if (confirm) {
              router.push(`/workspace/${currentWorkspaceId}/all`);
              permanentlyDeletePage(id);
            }
          });
        }}
      >
        Delete permanently
      </Button>
    </>
  );
};

export default TrashButtonGroup;
