import { ReactElement, useState } from 'react';
import { useAppState } from '@/providers/app-state-provider';
import type { NextPageWithLayout } from '../..//_app';

import dynamic from 'next/dynamic';
const DynamicBlocksuite = dynamic(() => import('@/components/editor'), {
  ssr: false,
});
const Page: NextPageWithLayout = () => {
  const [workspace, setWorkspace] = useState(null);
  const [page, setPage] = useState(null);
  const { dataCenter } = useAppState();
  console.log('dataCenter: ', dataCenter);

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
