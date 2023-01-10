import { styled } from '@/styles';
import { Workspace } from '@affine/datacenter';
import { Trans } from 'react-i18next';
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
      <Trans i18nKey="Export Workspace">
        Export Workspace
        <code style={{ margin: '0 10px' }}>
          {{ workspace: workspace.name }}
        </code>
        Is Comming
      </Trans>
    </ExportPageTitleContainer>
  );
};
