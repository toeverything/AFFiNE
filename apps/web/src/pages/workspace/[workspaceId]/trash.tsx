import { useTranslation } from '@affine/i18n';
import { TrashIcon } from '@blocksuite/icons';
import Head from 'next/head';
import { ReactElement, useCallback } from 'react';

import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import WorkspaceLayout from '@/components/workspace-layout';
import { useGlobalState } from '@/store/app';

export const Trash = () => {
  const pageList = useGlobalState(
    useCallback(store => store.dataCenterPageList, [])
  );
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t('Trash')} - AFFiNE</title>
      </Head>
      <PageListHeader icon={<TrashIcon />}>{t('Trash')}</PageListHeader>
      <PageList
        pageList={pageList.filter(p => p.trash)}
        isTrash={true}
        listType="trash"
      />
    </>
  );
};

Trash.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Trash;
