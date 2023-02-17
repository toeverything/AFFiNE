import Head from 'next/head';

import NotfoundPage from '@/components/404';

export default function Custom404() {
  return (
    <>
      <Head>
        <title>404 - AFFiNE</title>
      </Head>
      <NotfoundPage></NotfoundPage>
    </>
  );
}
