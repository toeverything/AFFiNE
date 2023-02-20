import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

import { PageLoading } from '@/components/loading';

const Home: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/workspace');
  }, [router]);
  return <PageLoading />;
};

export default Home;
