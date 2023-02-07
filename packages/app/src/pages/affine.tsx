import { displayFlex, styled } from '@affine/component';
import Loading from '@/components/loading';
import { Modal } from '@affine/component';
import { useState } from 'react';
import { Button } from '@affine/component';
import { FavouritedIcon } from '@blocksuite/icons';
import { toast } from '@affine/component';
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
      <Button
        icon={<FavouritedIcon />}
        onClick={() => {
          toast('hello, world!!');
        }}
      >
        click me!
      </Button>
      <Button icon={<FavouritedIcon />} type={'primary'}>
        click me!
      </Button>
      <Button icon={<FavouritedIcon />} type={'light'}>
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
      <Button loading={true}></Button>
      <Button loading={true} type="primary"></Button>
    </>
  );
};

export default Affine;
