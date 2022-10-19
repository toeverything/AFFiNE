import { useState } from 'react';
import { StyledFAQ, StyledIconWrapper, StyledFAQWrapper } from './style';
import { ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import Grow from '@mui/material/Grow';
import { Tooltip } from '../tooltip';
import ContactModal from '@/components/contact-modal';
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
            <Tooltip content="Keyboard shorts" placement="left-end">
              <StyledIconWrapper>
                <KeyboardIcon />
              </StyledIconWrapper>
            </Tooltip>
          </StyledFAQWrapper>
        </Grow>

        <StyledIconWrapper style={{ margin: '0', cursor: 'inherit' }}>
          <HelpIcon />
        </StyledIconWrapper>
      </StyledFAQ>
    </>
  );
};
