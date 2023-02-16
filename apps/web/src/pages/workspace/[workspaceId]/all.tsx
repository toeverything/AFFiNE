import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import { PageListHeader } from '@/components/header';
import { ReactElement, useCallback } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { useTranslation } from '@affine/i18n';
import { PageMeta } from '@/providers/app-state-provider';
import Head from 'next/head';
import { useGlobalState } from '@/store/app';

const All = () => {
  const currentWorkspace = useGlobalState(
    useCallback(store => store.currentDataCenterWorkspace, [])
  );
  const pageList = (currentWorkspace?.blocksuiteWorkspace?.meta.pageMetas ||
    []) as PageMeta[];
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t('All pages')} - AFFiNE</title>
      </Head>
      <PageListHeader icon={<AllPagesIcon />}>{t('All pages')}</PageListHeader>
      <PageList
        pageList={pageList.filter(p => !p.trash)}
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
