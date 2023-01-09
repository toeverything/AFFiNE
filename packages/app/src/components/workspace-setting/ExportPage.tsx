import { Workspace } from '@/hooks/mock-data/mock';
import { styled } from '@/styles';

export const ExportPageTitleContainer = styled('div')(() => {
  return {
    display: 'flex',
    marginTop: '60px',
    fontWeight: '500',
    flex: 1,
  };
});
export const ExportPage = ({ workspace }: { workspace: Workspace }) => {
  return (
    <ExportPageTitleContainer>
      Export Workspace{' '}
      <code style={{ margin: '0 10px' }}>{workspace.name}</code> Is Comming
    </ExportPageTitleContainer>
  );
};
