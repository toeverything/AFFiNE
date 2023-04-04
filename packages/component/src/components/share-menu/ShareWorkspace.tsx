import { Button } from '../..';
const ShareWorkspace = () => {
  const isPublicWorkspace = false;
  return (
    <div>
      {isPublicWorkspace ? (
        <div>
          Current workspace has been published to the web as a public workspace.
        </div>
      ) : (
        <div>Invite others to join the Workspace or publish it to web</div>
      )}

      <Button
        data-testid="share-menu-publish-to-web-button"
        onClick={() => {
          console.log('Open Workspace Settings');
        }}
        type="light"
        shape="circle"
      >
        Open Workspace Settings
      </Button>
    </div>
  );
};

export default ShareWorkspace;
