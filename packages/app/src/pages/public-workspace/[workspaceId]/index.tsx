import { PageList } from '@/components/page-list';
import { AllPagesIcon } from '@blocksuite/icons';
import { PageListHeader } from '@/components/header';
import { ReactElement } from 'react';
import { useTranslation } from '@affine/i18n';
import { useAppState } from '@/providers/app-state-provider';
import { useRouter } from 'next/router';
const All = () => {
  const { pageList } = useAppState();
  const { t } = useTranslation();
  const { dataCenter } = useAppState();
  const router = useRouter();

  console.log(router.query.workspaceId);
  dataCenter
    .loadPublicWorkspace(router.query.workspaceId as string)
    .then(data => {
      console.log(data);
    });
  return (
    <>
      <PageList
        pageList={pageList.filter(p => !p.trash)}
        showFavoriteTag={true}
      />
    </>
  );
};

All.getLayout = function getLayout(page: ReactElement) {
  return <div>{page}</div>;
};

export default All;
