import { useI18n } from '@affine/i18n';
import { UploadIcon } from '@blocksuite/icons/rc';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../../button';
import * as styles from './custom-icon-picker.css';
import {
  ALLOWED_TYPES,
  type IconFileError,
  resizeImage,
  validateIconFile,
} from './image';

interface CustomIconPickerProps {
  onSelect: (blob: Blob) => void;
}

export const CustomIconPicker = ({ onSelect }: CustomIconPickerProps) => {
  const t = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFile = (file: File) => {
    setError(null);

    const validationError = validateIconFile(file);
    if (validationError) {
      const messages: Record<IconFileError, string> = {
        'unsupported-type':
          t['com.affine.iconPicker.custom.error.unsupported'](),
        'too-large': t['com.affine.iconPicker.custom.error.tooLarge'](),
        'svg-too-large': t['com.affine.iconPicker.custom.error.svgTooLarge'](),
      };
      setError(messages[validationError]);
      return;
    }

    setProcessing(true);
    resizeImage(file)
      .then(blob => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview(url);
        onSelect(blob);
      })
      .catch(() => {
        setError(t['com.affine.iconPicker.custom.error.failed']());
      })
      .finally(() => {
        setProcessing(false);
      });
  };

  const clearPreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const openFileDialog = () => {
    if (!processing) inputRef.current?.click();
  };

  return (
    <div className={styles.container}>
      <div
        className={styles.uploadZone}
        onClick={openFileDialog}
        role="button"
        tabIndex={0}
        aria-label={t['com.affine.iconPicker.custom.upload']()}
        aria-busy={processing}
        data-dragging={dragging ? '' : undefined}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openFileDialog();
          }
        }}
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          if (processing) return;
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {processing ? (
          <span>{t['com.affine.iconPicker.custom.processing']()}</span>
        ) : preview ? (
          <img src={preview} alt="" className={styles.preview} />
        ) : (
          <>
            <UploadIcon fontSize={24} />
            <span>{t['com.affine.iconPicker.custom.upload']()}</span>
            <span className={styles.hint}>
              {t['com.affine.iconPicker.custom.hint']()}
            </span>
          </>
        )}
      </div>

      {preview && !processing && (
        <Button variant="plain" onClick={clearPreview}>
          {t['com.affine.iconPicker.custom.chooseAnother']()}
        </Button>
      )}

      {error && <span className={styles.error}>{error}</span>}

      <input
        ref={inputRef}
        type="file"
        accept={[...ALLOWED_TYPES].join(',')}
        className={styles.fileInput}
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
};
