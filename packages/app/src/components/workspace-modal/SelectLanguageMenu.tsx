import { LOCALES } from '@affine/i18n';
import { styled } from '@/styles';
import { useTranslation } from '@affine/i18n';
import { ArrowDownIcon } from '@blocksuite/icons';
import { Button } from '@/ui/button';
import { Menu, MenuItem } from '@/ui/menu';

const LanguageMenuContent = () => {
  const { i18n } = useTranslation();
  const changeLanguage = (event: string) => {
    i18n.changeLanguage(event);
  };
  return (
    <>
      {LOCALES.map(option => {
        return (
          <ListItem
            key={option.name}
            title={option.name}
            onClick={() => {
              changeLanguage(option.tag);
            }}
          >
            {option.originalName}
          </ListItem>
        );
      })}
    </>
  );
};
export const LanguageMenu = () => {
  const { i18n } = useTranslation();

  const currentLanguage = LOCALES.find(item => item.tag === i18n.language);

  return (
    <Menu
      content={<LanguageMenuContent />}
      placement="bottom"
      trigger="click"
      disablePortal={true}
    >
      <Button
        icon={<ArrowDownIcon />}
        iconPosition="end"
        noBorder={true}
        style={{ textTransform: 'capitalize' }}
      >
        {currentLanguage?.originalName}
      </Button>
    </Menu>
  );
};

const ListItem = styled(MenuItem)(({ theme }) => ({
  height: '38px',
  color: theme.colors.popoverColor,
  fontSize: theme.font.sm,
  textTransform: 'capitalize',
  padding: '0 24px',
}));
