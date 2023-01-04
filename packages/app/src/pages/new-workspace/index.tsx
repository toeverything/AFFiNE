import { WorkspaceModal } from '@/components/workspace-modal';
import { getWorkspaceList } from '@/hooks/mock-data/mock';
import { useEffect, useState } from 'react';
import { styled } from '@/styles';
import Button from '@/ui/button/Button';

const Page = () => {
  const [open, setOpen] = useState<boolean>(true);

  useEffect(() => {
    const data = getWorkspaceList();
    if (!data.length) {
      setOpen(true);
    }
  }, []);
  return (
    <Workspace>
      <h1>workspace</h1>
      <div>
        <Button
          onClick={() => {
            setOpen(true);
          }}
        >
          View Workspace List
        </Button>
      </div>
      <WorkspaceModal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      ></WorkspaceModal>
    </Workspace>
  );
};
export default Page;

const Workspace = styled.div(({ theme }) => {
  return {
    height: '100vh',
    background: theme.colors.pageBackground,
    color: '#FFFFFF',
    fontSize: '18px',
    fontWeight: 500,
  };
});
