import { useTranslation } from '@affine/i18n';
import { FavouritesIcon } from '@blocksuite/icons';
import Head from 'next/head';
import { ReactElement } from 'react';

import { PageListHeader } from '@/components/header';
import { PageList } from '@/components/page-list';
import WorkspaceLayout from '@/components/workspace-layout';
import { useGlobalState } from '@/store/app';

export const Favorite = () => {
  const pageList = useGlobalState(store => store.dataCenterPageList);
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t('Favorites')} - AFFiNE</title>
      </Head>
      <PageListHeader icon={<FavouritesIcon />}>
        {t('Favorites')}
      </PageListHeader>
      <PageList
        pageList={pageList.filter(p => p.favorite && !p.trash)}
        showFavoriteTag={true}
        listType="favorite"
      />
    </>
  );
};
Favorite.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};
export default Favorite;
