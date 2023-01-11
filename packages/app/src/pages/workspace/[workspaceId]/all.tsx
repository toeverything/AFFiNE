import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import { PageListHeader } from '@/components/header';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { useTranslation } from '@affine/i18n';
import { useAppState } from '@/providers/app-state-provider';
const All = () => {
  const { pageList } = useAppState();
  const { t } = useTranslation();
  return (
    <>
      <PageListHeader icon={<AllPagesIcon />}>{t('All pages')}</PageListHeader>
      <PageList
        pageList={pageList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default All;
