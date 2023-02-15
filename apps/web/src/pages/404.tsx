import NotfoundPage from '@/components/404';
import Head from 'next/head';

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
