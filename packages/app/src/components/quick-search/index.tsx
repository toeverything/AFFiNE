import { Modal, ModalWrapper } from '@/ui/modal';
import {
  StyledContent,
  StyledModalHeader,
  StyledModalFooter,
  StyledModalDivider,
  StyledShortcut,
} from './style';
import Input from './Input';
import Result from './content';
import QuickSearchFooter from './Footer';
import { Command } from 'cmdk';
import { useState } from 'react';
type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};
const isMac = () => {
  return /macintosh|mac os x/i.test(navigator.userAgent);
};
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  const [search, setSearch] = useState('');
  return (
    <Modal open={open} onClose={onClose} wrapperPosition={['top', 'center']}>
      <ModalWrapper
        width={620}
        height={'auto'}
        style={{
          maxHeight: '720px',
          minHeight: '350px',
          borderRadius: '20px',
          top: '138px',
        }}
      >
        <Command>
          <StyledModalHeader>
            <Input search={search} setSearch={setSearch} />
            <StyledShortcut>{isMac() ? '⌘+K' : 'Ctrl+K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <StyledContent>
            <Result search={search} />
          </StyledContent>

          <StyledModalFooter>
            <QuickSearchFooter />
          </StyledModalFooter>
        </Command>
      </ModalWrapper>
    </Modal>
  );
};

export default QuickSearch;
