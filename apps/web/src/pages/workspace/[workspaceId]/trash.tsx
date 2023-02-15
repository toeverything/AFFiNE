import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import { TrashIcon } from '@blocksuite/icons';
import { ReactElement } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { useTranslation } from '@affine/i18n';
import { useAppState } from '@/providers/app-state-provider';
import Head from 'next/head';
export const Trash = () => {
  const { pageList } = useAppState();
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
