import { Modal } from '@/ui/modal';

import {
  StyledModalWrapper,
  StyledContent,
  StyledModalHeader,
  StyledModalFooter,
  StyledModalDivider,
  StyledShortcut,
} from './style';
import Input from './input';
import Result from './content';
import QuickSearchFooter from './footer';
type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};
const isMac = () => {
  return /macintosh|mac os x/i.test(navigator.userAgent);
};
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  return (
    <Modal open={open} onClose={onClose}>
      <StyledModalWrapper data-testid="quick-search-modal-content">
        <StyledModalHeader>
          <Input />
          <StyledShortcut>{isMac() ? '⌘+K' : 'Ctrl+K'}</StyledShortcut>
        </StyledModalHeader>
        <StyledModalDivider />
        <StyledContent>
          <Result />
        </StyledContent>

        <StyledModalFooter>
          <QuickSearchFooter />
        </StyledModalFooter>
      </StyledModalWrapper>
    </Modal>
  );
};

export default QuickSearch;
