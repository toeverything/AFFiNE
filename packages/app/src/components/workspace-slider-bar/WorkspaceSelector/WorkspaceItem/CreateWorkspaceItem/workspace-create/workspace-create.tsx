import { getDataCenter } from '@affine/datacenter';
import Modal from '@/ui/modal';
import Input from '@/ui/input';
import {
  StyledModalHeader,
  StyledTextContent,
  StyledModalWrapper,
  StyledInputContent,
  StyledButtonContent,
  StyledButton,
} from './style';
import { useState } from 'react';
import { ModalCloseButton } from '@/ui/modal';
import router from 'next/router';
import { useAppState } from '@/providers/app-state-provider';

interface WorkspaceCreateProps {
  open: boolean;
  onClose: () => void;
}

const DefaultHeadImgColors = [
  ['#C6F2F3', '#0C6066'],
  ['#FFF5AB', '#896406'],
  ['#FFCCA7', '#8F4500'],
  ['#FFCECE', '#AF1212'],
  ['#E3DEFF', '#511AAB'],
];

export const WorkspaceCreate = ({ open, onClose }: WorkspaceCreateProps) => {
  const [workspaceName, setWorkspaceId] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const { refreshWorkspacesMeta } = useAppState();
  const handlerInputChange = (workspaceName: string) => {
    setWorkspaceId(workspaceName);
  };
  const createDefaultHeadImg = (workspaceName: string) => {
    const canvas = document.createElement('canvas');
    canvas.height = 100;
    canvas.width = 100;
    const ctx = canvas.getContext('2d');
    return new Promise<string>((resolve, reject) => {
      if (ctx) {
        const randomNumber = Math.floor(Math.random() * 5);
        const randomColor = DefaultHeadImgColors[randomNumber];
        ctx.fillStyle = randomColor[0];
        ctx.fillRect(0, 0, 100, 100);
        ctx.font = "600 50px 'PingFang SC', 'Microsoft Yahei'";
        ctx.fillStyle = randomColor[1];
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(workspaceName[0], 50, 50);
        canvas.toBlob(blob => {
          if (blob) {
            // const blobId = getDataCenter().then(dc =>
            //   dc.apis.uploadBlob({ blob })
            // );
            // resolve(blobId);
          } else {
            reject();
          }
        }, 'image/png');
      } else {
        reject();
      }
    });
  };
  const handleCreateWorkspace = async () => {
    setCreating(true);
    const blobId = await createDefaultHeadImg(workspaceName).catch(() => {
      setCreating(false);
    });
    if (blobId) {
      // getDataCenter()
      //   .then(dc =>
      //     dc.apis.createWorkspace({ name: workspaceName, avatar: blobId })
      //   )
      //   .then(async data => {
      //     await refreshWorkspacesMeta();
      //     // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //     // @ts-ignore
      //     router.push(`/workspace/${data.id}`);
      //     onClose();
      //   })
      //   .catch(err => {
      //     console.log(err, 'err');
      //   })
      //   .finally(() => {
      //     setCreating(false);
      //   });
    }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper>
        <ModalCloseButton onClick={onClose} />
        <StyledModalHeader>Create new Workspace</StyledModalHeader>
        <StyledTextContent>
          Workspaces are shared environments where teams can collaborate. After
          creating a Workspace, you can invite others to join.
        </StyledTextContent>
        <StyledInputContent>
          <Input
            onChange={handlerInputChange}
            placeholder="Set a Workspace name"
            value={workspaceName}
          ></Input>
        </StyledInputContent>
        <StyledButtonContent>
          <StyledButton
            disabled={!workspaceName.length || creating}
            onClick={handleCreateWorkspace}
            loading={creating}
          >
            Create
          </StyledButton>
        </StyledButtonContent>
      </StyledModalWrapper>
    </Modal>
  );
};

export default WorkspaceCreate;
