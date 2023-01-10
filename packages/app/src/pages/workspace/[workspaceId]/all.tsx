import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import usePageMetaList from '@/hooks/use-page-meta-list';
import { PageListHeader } from '@/components/header';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { useTranslation } from 'react-i18next';
const All = () => {
  const pageMetaList = usePageMetaList();
  const { t } = useTranslation();
  return (
    <>
      <PageListHeader icon={<AllPagesIcon />}>{t('All pages')}</PageListHeader>
      <PageList
        pageList={pageMetaList.filter(p => !p.trash)}
        showFavoriteTag={true}
        listType="all"
      />
    </>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default All;
