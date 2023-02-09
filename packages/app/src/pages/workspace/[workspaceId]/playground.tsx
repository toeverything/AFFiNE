import { styled } from '@affine/component';

import { ReactElement, ReactNode } from 'react';
import WorkspaceLayout from '@/components/workspace-layout';
import { Button } from '@affine/component';

export const FeatureCardDiv = styled('section')({
  width: '800px',
  border: '1px #eee solid',
  margin: '20px auto',
  minHeight: '100px',
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
          <li>AFFiNE XXX</li>
        </ul>
        <Button>New Workspace</Button>
      </FeatureCard>

      <FeatureCard name="Active Workspace">
        <div>Workspace Name /[Workspace Members Count]/[Workspace Avatar]</div>
        <div>Cloud Sync [Yes/No]</div>
        <div>Auth [Public/Private]</div>
        <div>
          <Button>Update Workspace Name</Button>
          <Button>Upload Workspace Avatar</Button>
          <Button>Update Workspace Avatar</Button>
        </div>

        <div>
          <Button>Leave Workspace</Button>
          <Button>Delete Workspace </Button>
        </div>
        <div>
          Cloud Sync <Button>Enalbe</Button>
          <Button>Disable</Button>
        </div>
      </FeatureCard>

      <FeatureCard name="Workspace Members">
        <Button>Add Member</Button>
        <ul>
          <li>
            terrychinaz@gmail <button>Delete Members</button>
          </li>
        </ul>
      </FeatureCard>

      <FeatureCard name="Cloud Search">
        <input type="text" value="AFFiNE Keywords" />
        <Button>Search</Button>
        <ul></ul>
      </FeatureCard>

      <FeatureCard name="Import/Exeport Worpsace">
        <div>Workspace Name</div>
        <Button> Export Workspace</Button>
        <Button> Import Workspace</Button>
      </FeatureCard>
    </>
  );
};

Playground.getLayout = function getLayout(page: ReactElement) {
  return <WorkspaceLayout>{page}</WorkspaceLayout>;
};

export default Playground;
