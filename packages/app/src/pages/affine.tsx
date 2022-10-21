import { displayFlex, styled } from '@/styles';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';
import { Loading } from '@/components/loading';

export const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  ...displayFlex('space-between', 'center'),
  position: 'relative',
  padding: '0 22px',
  borderBottom: '1px solid #e5e5e5',
});

const Affine = () => {
  return (
    <>
      <StyledHeader>
        <ThemeModeSwitch></ThemeModeSwitch>
      </StyledHeader>
      <Loading />
    </>
  );
};

export default Affine;
