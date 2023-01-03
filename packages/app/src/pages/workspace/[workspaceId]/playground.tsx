import { styled } from '@/styles';

import { ReactElement, ReactNode } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { Button } from '@/ui/button';

export const FeatureCardDiv = styled('section')({
  width: '800px',
  border: '1px #eee solid',
  margin: '20px auto',
  minHeight: '200px',
  padding: '15px',
});
const FeatureCard = (props: {
  name: string;
  children: ReactNode | ReactNode[];
}) => {
  return (
    <FeatureCardDiv>
      <h1>Feature - {props.name}</h1>
      {props.children}
    </FeatureCardDiv>
  );
};

export const Playground = () => {
  return (
    <>
      <FeatureCard name="Account">
        <Button>Sign In</Button>
        <Button>Sign Out</Button>
      </FeatureCard>

      <FeatureCard name="Workspace List">
        <ul>
          <li>AFFiNE Demo</li>
        </ul>
      </FeatureCard>

      <FeatureCard name="Active Workspace">
        <Button>Upate Workspace Name</Button>
        <Button>Upate Workspace Aavartor</Button>
        <Button>Leave Workspace</Button>
        <Button>Delete Workspace </Button>
      </FeatureCard>
    </>
  );
};

Playground.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Playground;
