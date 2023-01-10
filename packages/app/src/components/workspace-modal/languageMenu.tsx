import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import type { TooltipProps } from '@mui/material';
import { styled } from '@/styles';
import { Button, Tooltip } from '@mui/material';
import { useState } from 'react';
import { useTranslation, LOCALES } from '@affine/i18n';

export const LanguageMenu = () => {
  const { i18n } = useTranslation();
  const changeLanguage = (event: string) => {
    i18n.changeLanguage(event);
  };
  const [show, setShow] = useState(false);
  const currentLanguage = LOCALES.find(item => item.tag === i18n.language);
  const [languageName, setLanguageName] = useState(
    currentLanguage?.originalName
  );
  return (
    <StyledTooltip
      title={
        <>
          {LOCALES.map(option => {
            return (
              <ListItem
                key={option.name}
                title={option.name}
                onClick={() => {
                  changeLanguage(option.tag);
                  setShow(false);
                  setLanguageName(option.originalName);
                }}
              >
                {option.originalName}
              </ListItem>
            );
          })}
        </>
      }
      open={show}
    >
      <StyledTitleButton
        variant="text"
        onClick={() => {
          setShow(!show);
        }}
      >
        <StyledContainer>
          <StyledText>{languageName}</StyledText>
          <UnfoldMoreIcon />
        </StyledContainer>
      </StyledTitleButton>
    </StyledTooltip>
  );
};

const StyledContainer = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'center',
  alignItems: 'center',
}));

const StyledText = styled('span')(({ theme }) => ({
  marginRight: '4px',
  marginLeft: '16px',
  fontSize: theme.font.sm,
  fontWeight: '500',
  textTransform: 'capitalize',
}));
const StyledTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))(({ theme }) => ({
  zIndex: theme.zIndex.modal,
  '& .MuiTooltip-tooltip': {
    backgroundColor: theme.colors.popoverBackground,
    boxShadow: theme.shadow.modal,
    color: theme.colors.popoverColor,
  },
}));

const ListItem = styled(Button)(({ theme }) => ({
  display: 'block',
  width: '100%',
  color: theme.colors.popoverColor,
  fontSize: theme.font.sm,
  textTransform: 'capitalize',
}));

const StyledTitleButton = styled(Button)(({ theme }) => ({
  position: 'absolute',
  right: '50px',
  color: theme.colors.popoverColor,
  fontSize: theme.font.sm,
}));
