import { useI18n } from '@affine/i18n';
import { UploadIcon } from '@blocksuite/icons/rc';
import { useEffect, useRef, useState } from 'react';

import { Button } from '../../../button';
import * as styles from './custom-icon-picker.css';
import {
  ALLOWED_TYPES,
  DIMENSIONS_ERROR,
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
  // The file dialog can deliver a file while an older resize task still
  // runs, so each task gets an id and only the latest task may apply.
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFile = (file: File) => {
    const requestId = ++requestIdRef.current;
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
      // This call also cancelled any older task, so its `finally` will not
      // clear the processing state.
      setProcessing(false);
      return;
    }

    setProcessing(true);
    resizeImage(file)
      .then(blob => {
        if (requestId !== requestIdRef.current) return;
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreview(url);
        onSelect(blob);
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) return;
        setError(
          error instanceof Error && error.message === DIMENSIONS_ERROR
            ? t['com.affine.iconPicker.custom.error.dimensions']()
            : t['com.affine.iconPicker.custom.error.failed']()
        );
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setProcessing(false);
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
