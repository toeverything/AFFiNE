import { AffineLogoSBlue2_1Icon } from '@blocksuite/icons';
import { useCallback } from 'react';

export const HeaderItem = () => {
  return (
    <button
      style={{
        width: '32px',
        height: '32px',
        fontSize: '24px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={useCallback(() => {
        console.log('clicked hello world!');
      }, [])}
    >
      <AffineLogoSBlue2_1Icon />
    </button>
  );
};
