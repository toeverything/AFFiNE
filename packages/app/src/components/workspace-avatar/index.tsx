import { useAppState } from '@/providers/app-state-provider';
import { stringToColour } from '@/utils';
import { useEffect, useState } from 'react';

interface IWorkspaceAvatar {
  size: number;
  name: string;
  avatar: string;
}

export const WorkspaceAvatar = (props: IWorkspaceAvatar) => {
  const size = props.size || 20;
  const sizeStr = size + 'px';
  const { dataCenter, currentWorkspace } = useAppState();
  dataCenter.getBlob(currentWorkspace, props.avatar).then(res => {
    setAvatar(res ?? '');
  });
  const [avatar, setAvatar] = useState<string>(props.avatar);

  useEffect(() => {
    dataCenter.getBlob(currentWorkspace, props.avatar).then(res => {
      setAvatar(res ?? '');
    });
  }, [props.avatar]);

  return (
    <>
      {avatar ? (
        <div
          style={{
            width: sizeStr,
            height: sizeStr,
            border: '1px solid #fff',
            color: '#fff',
            borderRadius: '50%',
            overflow: 'hidden',
          }}
        >
          <img src={avatar} alt="" />
        </div>
      ) : (
        <div
          style={{
            width: sizeStr,
            height: sizeStr,
            border: '1px solid #fff',
            color: '#fff',
            fontSize: Math.ceil(0.5 * size) + 'px',
            background: stringToColour(props.name || 'AFFiNE'),
            borderRadius: '50%',
            textAlign: 'center',
            lineHeight: size + 'px',
          }}
        >
          {(props.name || 'AFFiNE').substring(0, 1)}
        </div>
      )}
    </>
  );
};
