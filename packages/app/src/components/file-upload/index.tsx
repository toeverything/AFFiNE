import { Button } from '@affine/component';
import { FC, useRef, ChangeEvent, ReactElement } from 'react';
import { styled } from '@affine/component';
import { useTranslation } from '@affine/i18n';
interface Props {
  uploadType?: string;
  children?: ReactElement;
  accept?: string;
  fileChange: (file: File) => void;
}
export const Upload: FC<Props> = props => {
  const { fileChange, accept } = props;
  const { t } = useTranslation();
  const input_ref = useRef<HTMLInputElement>(null);
  const _chooseFile = () => {
    if (input_ref.current) {
      input_ref.current.click();
    }
  };
  const _handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) {
      return;
    }
    const file = files[0];
    fileChange(file);
    if (input_ref.current) {
      input_ref.current.value = '';
    }
  };
  return (
    <UploadStyle onClick={_chooseFile}>
      {props.children ?? <Button>{t('Upload')}</Button>}
      <input
        ref={input_ref}
        type="file"
        style={{ display: 'none' }}
        onChange={_handleInputChange}
        accept={accept}
      />
    </UploadStyle>
  );
};

const UploadStyle = styled('div')(() => {
  return {
    display: 'inline-block',
  };
});
