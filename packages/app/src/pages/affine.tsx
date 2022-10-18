import { styled } from '@/styles';
import { ThemeModeSwitch } from '@/components/theme-mode-switch';

export const StyledHeader = styled('div')({
  height: '60px',
  width: '100vw',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  position: 'relative',
  padding: '0 22px',
  borderBottom: '1px solid #e5e5e5',
});

const Affine = () => {
  return (
    <StyledHeader>
      <ThemeModeSwitch></ThemeModeSwitch>
    </StyledHeader>
  );
};

export default Affine;
