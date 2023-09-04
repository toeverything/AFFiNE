import { useSearchParams } from 'react-router-dom';

export const Component = function MigrationPage() {
  const [params] = useSearchParams();
  const workspaceid = params.get('workspace_id');
  console.log('workspaceId', workspaceid);
  return <div></div>;
};
