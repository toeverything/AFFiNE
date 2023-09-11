import { Empty } from '@affine/component';
import { Logo1Icon } from '@blocksuite/icons';

export const SharePageNotFoundError = () => {
  return (
    <div
      style={{
        width: '100%',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <a
        href="https://affine.pro/"
        target="_blank"
        rel="noreferrer"
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          fontSize: '24px',
          cursor: 'pointer',
        }}
      >
        <Logo1Icon />
      </a>
      <Empty
        description={'You do not have access or this content does not exist.'}
      />
    </div>
  );
};
