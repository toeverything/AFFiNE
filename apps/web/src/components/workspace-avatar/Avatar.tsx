import { stringToColour } from '@/utils';
interface IWorkspaceAvatar {
  size: number;
  name: string;
  avatar: string;
  style?: React.CSSProperties;
}

export const WorkspaceAvatar = (props: IWorkspaceAvatar) => {
  const size = props.size || 20;
  const sizeStr = size + 'px';

  return (
    <>
      {props.avatar ? (
        <div
          style={{
            ...props.style,
            width: sizeStr,
            height: sizeStr,
            color: '#fff',
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        >
          <picture>
            <img
              style={{ width: sizeStr, height: sizeStr }}
              src={props.avatar}
              alt=""
              referrerPolicy="no-referrer"
            />
          </picture>
        </div>
      ) : (
        <div
          style={{
            ...props.style,
            width: sizeStr,
            height: sizeStr,
            border: '1px solid #fff',
            color: '#fff',
            fontSize: Math.ceil(0.5 * size) + 'px',
            background: stringToColour(props.name || 'AFFiNE'),
            borderRadius: '50%',
            textAlign: 'center',
            lineHeight: size + 'px',
            display: 'inline-block',
            verticalAlign: 'middle',
          }}
        >
          {(props.name || 'AFFiNE').substring(0, 1)}
        </div>
      )}
    </>
  );
};
