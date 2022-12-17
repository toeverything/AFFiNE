import { displayFlex, styled } from '@/styles';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { Loading } from '@/components/loading';
import Modal from '@/ui/modal';
import { useState } from 'react';
export const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  ...displayFlex('space-between', 'center'),
  position: 'relative',
  padding: '0 22px',
  borderBottom: '1px solid #e5e5e5',
});

const Affine = () => {
  const [show, setShow] = useState(false);
  return (
    <>
      <StyledHeader>
        <ThemeModeSwitch></ThemeModeSwitch>
        <button
          onClick={() => {
            setShow(true);
          }}
        >
          click me!
        </button>
      </StyledHeader>
      <Modal
        open={show}
        onClose={() => {
          setShow(false);
        }}
      >
        <div>hi</div>
      </Modal>
      <Loading />
    </>
  );
};

export default Affine;
