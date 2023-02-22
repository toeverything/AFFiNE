import { useTranslation } from '@affine/i18n';
import { FolderIcon } from '@blocksuite/icons';
import Head from 'next/head';
import { ReactElement, useCallback } from 'react';

import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import WorkspaceLayout from '@/components/workspace-layout';
import { useGlobalState } from '@/store/app';

const All = () => {
  const pageList = useGlobalState(
    useCallback(store => store.dataCenterPageList, [])
  );
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t('All pages')} - AFFiNE</title>
      </Head>
      <PageListHeader icon={<FolderIcon />}>{t('All pages')}</PageListHeader>
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
