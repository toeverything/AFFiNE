import type { GetServerSideProps, NextPage } from 'next';

export const getServerSideProps: GetServerSideProps = async () => {
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
