import { stringToColour } from '@/utils';
interface IWorkspaceAvatar {
  size: number;
  name: string;
  avatar: string;
}

export const WorkspaceAvatar = (props: IWorkspaceAvatar) => {
  const size = props.size || 20;
  const sizeStr = size + 'px';

  return (
    <>
      {props.avatar ? (
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
          <picture>
            <img src={props.avatar} alt="" />
          </picture>
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
