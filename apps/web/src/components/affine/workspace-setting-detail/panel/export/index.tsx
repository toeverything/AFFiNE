import { Button, toast, Wrapper } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

export const ExportPanel = () => {
  const t = useAFFiNEI18N();
  return (
    <>
      <Wrapper marginBottom="42px"> {t['Export Description']()}</Wrapper>
      <Button
        type="light"
        shape="circle"
        disabled={!environment.isDesktop || !id}
        onClick={async () => {
          if (id && (await window.apis?.dialog.saveDBFileAs(id))) {
            toast(t('Export success'));
          }
        }}
      >
        {t['Export AFFiNE backup file']()}
      </Button>
    </>
  );
};
