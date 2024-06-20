import { Button } from '@affine/component/ui/button';
import { useI18n } from '@affine/i18n';
import type { ChangeEvent, PropsWithChildren } from 'react';
import { useRef } from 'react';

export interface UploadProps {
  uploadType?: string;
  accept?: string;
  fileChange: (file: File) => void;
  disabled?: boolean;
}

export const Upload = ({
  fileChange,
  accept,
  children,
  disabled,
  ...props
}: PropsWithChildren<UploadProps>) => {
  const t = useI18n();
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

  if (disabled) {
    return children ?? <Button>{t['Upload']()}</Button>;
  }

  return (
    <div style={{ display: 'flex' }} onClick={_chooseFile}>
      {children ?? <Button>{t['Upload']()}</Button>}
      <input
        ref={input_ref}
        type="file"
        style={{ display: 'none' }}
        onChange={_handleInputChange}
        accept={accept}
        {...props}
      />
    </div>
  );
};
