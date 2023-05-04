import { Button, Wrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

export const ExportPanel = () => {
  const t = useAFFiNEI18N();
  return (
    <>
      <Wrapper marginBottom="42px"> {t['Export Description']()}</Wrapper>
      <Button
        type="light"
        shape="circle"
        disabled={!environment.isDesktop}
        onClick={() => {
          window.apis.openSaveDBFileDialog();
        }}
      >
        {t['Export AFFiNE backup file']()}
      </Button>
    </>
  );
};
