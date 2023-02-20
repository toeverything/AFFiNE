import type { GetStaticProps, NextPage } from 'next';

export const getStaticProps: GetStaticProps = async () => {
  return {
    redirect: {
      destination: '/workspace',
      permanent: true,
    },
  };
};

const Home: NextPage = () => {
  throw new Error('unreachable');
};

export default Home;
