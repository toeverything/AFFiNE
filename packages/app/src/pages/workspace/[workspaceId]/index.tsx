import {
  useLoadWorkspace,
  useLoadPage,
} from '@/providers/app-state-provider/hooks';

const Page = () => {
  useLoadWorkspace();
  useLoadPage();

  return <></>;
};

export default Page;
