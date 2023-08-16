import { CloseIcon, MinusIcon, RoundedRectangleIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

import * as style from './style.css';

export const WindowsAppControls = () => {
  const handleMinimizeApp = useCallback(() => {
    window.apis?.ui.handleMinimizeApp().catch(err => {
      console.error(err);
    });
  }, []);
  const handleMaximizeApp = useCallback(() => {
    window.apis?.ui.handleMaximizeApp().catch(err => {
      console.error(err);
    });
  }, []);
  const handleCloseApp = useCallback(() => {
    window.apis?.ui.handleCloseApp().catch(err => {
      console.error(err);
    });
  }, []);

  return (
    <div
      data-platform-target="win32"
      className={style.windowAppControlsWrapper}
    >
      <button
        data-type="minimize"
        className={style.windowAppControl}
        onClick={handleMinimizeApp}
      >
        <MinusIcon />
      </button>
      <button
        data-type="maximize"
        className={style.windowAppControl}
        onClick={handleMaximizeApp}
      >
        <RoundedRectangleIcon />
      </button>
      <button
        data-type="close"
        className={style.windowAppControl}
        onClick={handleCloseApp}
      >
        <CloseIcon />
      </button>
    </div>
  );
};
