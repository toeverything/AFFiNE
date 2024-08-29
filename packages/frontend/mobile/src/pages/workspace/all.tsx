import { AppTabs } from '../../components';
import { AllDocList, AllDocsHeader, AllDocsMenu } from '../../views';

export const Component = () => {
  return (
    <>
      <AllDocsHeader operations={<AllDocsMenu />} />
      <AllDocList />
      <AppTabs />
    </>
  );
};
