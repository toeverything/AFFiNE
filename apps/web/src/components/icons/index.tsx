import {
  JoinedWorkspaceIcon as DefaultJoinedWorkspaceIcon,
  LocalWorkspaceIcon as DefaultLocalWorkspaceIcon,
  CloudWorkspaceIcon as DefaultCloudWorkspaceIcon,
  LocalDataIcon as DefaultLocalDataIcon,
  PublishIcon as DefaultPublishIcon,
} from '@blocksuite/icons';

// Here are some icons with special color or size

export const JoinedWorkspaceIcon = () => {
  return <DefaultJoinedWorkspaceIcon style={{ color: '#FF646B' }} />;
};
export const LocalWorkspaceIcon = () => {
  return <DefaultLocalWorkspaceIcon style={{ color: '#FDBD32' }} />;
};

export const CloudWorkspaceIcon = () => {
  return <DefaultCloudWorkspaceIcon style={{ color: '#60A5FA' }} />;
};

export const LocalDataIcon = () => {
  return <DefaultLocalDataIcon style={{ color: '#62CD80' }} />;
};

export const PublishIcon = () => {
  return <DefaultPublishIcon style={{ color: '#8699FF' }} />;
};
