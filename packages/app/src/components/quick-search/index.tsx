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
import { useEditor } from '@/providers/editor-provider';
type TransitionsModalProps = {
  open: boolean;
  onClose: () => void;
};
const isMac = () => {
  return /macintosh|mac os x/i.test(navigator.userAgent);
};
export const QuickSearch = ({ open, onClose }: TransitionsModalProps) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState({});
  const { search } = useEditor();
  const { pageList } = useEditor();

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
            <Input query={query} setQuery={setQuery} />
            <StyledShortcut>{isMac() ? '⌘+K' : 'Ctrl+K'}</StyledShortcut>
          </StyledModalHeader>
          <StyledModalDivider />
          <StyledContent>
            <Result result={query} />
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
