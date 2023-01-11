import { ReactElement, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import type { NextPageWithLayout } from '../..//_app';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});
const Page: NextPageWithLayout = () => {
  const [workspace, setWorkspace] = useState(null);
  const [page, setPage] = useState(null);
  const { dataCenter } = useAppState();
  console.log('dataCenter: ', dataCenter);
  const router = useRouter();

  console.log(router.query.workspaceId);
  dataCenter
    .loadPublicWorkspace(router.query.workspaceId as string)
    .then(data => {
      console.log(data);
    });
  return (
    <>
      {workspace && page && (
        <DynamicBlocksuite
          page={page}
          workspace={workspace}
          setEditor={() => {
            console.log('test');
          }}
        />
      )}
    </>
  );
};

Page.getLayout = function getLayout(page: ReactElement) {
  return <div>{page}</div>;
};

export default Page;
