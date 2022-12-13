import { displayFlex, styled } from '@/styles';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { Loading } from '@/components/loading';
import Modal from '@/ui/modal';
import { useState } from 'react';
import { Button } from '@/ui/button';
import { FavouritedIcon } from '@blocksuite/icons';
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

      <Button icon={<FavouritedIcon />}>click me!</Button>
      <Button icon={<FavouritedIcon />} type={'primary'}>
        click me!
      </Button>
      <Button icon={<FavouritedIcon />} type={'warning'}>
        click me!
      </Button>
      <Button icon={<FavouritedIcon />} type={'danger'}>
        click me!
      </Button>

      <Button icon={<FavouritedIcon />}></Button>
      <Button icon={<FavouritedIcon />} shape="round"></Button>
    </>
  );
};

export default Affine;
