import { styled } from '@/styles';
import Fade from '@mui/material/Fade';


const StyledModal = styled('div')(({ theme }) => {
  return {
    color: theme.colors.textColor,
  };
});

type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
  children: JSX.Element;
};

export const ShortcutsModal = (props: TransitionsModalProps) => {
  return <div>111</div>;
};
