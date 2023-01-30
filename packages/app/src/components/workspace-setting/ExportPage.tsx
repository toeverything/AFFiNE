import { styled } from '@/styles';
import { WorkspaceUnit } from '@affine/datacenter';
import { Trans } from '@affine/i18n';
export const ExportPageTitleContainer = styled('div')(() => {
  return {
    display: 'flex',

    fontWeight: '500',
    flex: 1,
  };
});
export const ExportPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
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
