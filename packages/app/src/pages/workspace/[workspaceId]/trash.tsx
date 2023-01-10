import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { TrashIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { useTranslation } from '@affine/i18n';
export const Trash = () => {
  const pageMetaList = usePageMetaList();
  const { t } = useTranslation();
  return (
    <>
      <PageListHeader icon={<TrashIcon />}>{t('Trash')}</PageListHeader>
      <PageList pageList={pageMetaList.filter(p => p.trash)} isTrash={true} />
    </>
  );
};

Trash.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Trash;
