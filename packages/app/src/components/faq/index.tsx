import { useState } from 'react';
import {
  StyledFAQ,
  StyledIconWrapper,
  StyledFAQWrapper,
  StyledTransformIcon,
} from './style';
import { CloseIcon, ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import Grow from '@mui/material/Grow';
import { Tooltip } from '../tooltip';
import ContactModal from '@/components/contact-modal';
import ShortcutsModal from '@/components/shortcuts-modal';
const Contact = () => {
  const [openModal, setOpenModal] = useState(false);
  return (
    <>
      <ContactModal open={openModal} onClose={() => setOpenModal(false)} />
      <Tooltip content="Contact with us" placement="left-end">
        <StyledIconWrapper
          onClick={() => {
            setOpenModal(true);
          }}
        >
          <ContactIcon />
        </StyledIconWrapper>
      </Tooltip>
    </>
  );
};

const Shortcuts = () => {
  const [openModal, setOpenModal] = useState(false);
  return (
    <>
      <ShortcutsModal
        open={openModal}
        onClose={() => {
          setOpenModal(false);
        }}
      />

      <Tooltip content="Keyboard shorts" placement="left-end">
        <StyledIconWrapper
          onClick={() => {
            setOpenModal(true);
          }}
        >
          <KeyboardIcon />
        </StyledIconWrapper>
      </Tooltip>
    </>
  );
};
export const FAQ = () => {
  const [showContent, setShowContent] = useState(false);
  return (
    <>
      <StyledFAQ
        className=""
        onMouseEnter={() => {
          setShowContent(true);
        }}
        onMouseLeave={() => {
          setShowContent(false);
        }}
      >
        <Grow in={showContent}>
          <StyledFAQWrapper>
            <Contact />
            <Shortcuts />
          </StyledFAQWrapper>
        </Grow>

        <div style={{ position: 'relative' }}>
          <StyledIconWrapper>
            <HelpIcon />
          </StyledIconWrapper>
          <StyledTransformIcon in={showContent}>
            <CloseIcon />
          </StyledTransformIcon>
        </div>
      </StyledFAQ>
    </>
  );
};
