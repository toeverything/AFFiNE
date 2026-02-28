import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { UploadIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  type ChangeEvent,
  type DragEvent,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

interface FileUploadAreaProps {
  onFileSelected: (file: File) => Promise<void>;
}

export interface FileUploadAreaRef {
  triggerFileUpload: () => void;
}

/**
 * Component for CSV file upload with drag and drop support
 */
export const FileUploadArea = forwardRef<
  FileUploadAreaRef,
  FileUploadAreaProps
>(({ onFileSelected }, ref) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useAsyncCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      await onFileSelected(file);
    },
    [onFileSelected]
  );

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  useImperativeHandle(ref, () => ({
    triggerFileUpload: triggerFileInput,
  }));

  const validateAndProcessFile = useAsyncCallback(
    async (file: File) => {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast.error('Please upload a CSV file');
        return;
      }
      await onFileSelected(file);
    },
    [onFileSelected]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length === 0) return;

      validateAndProcessFile(files[0]);
    },
    [validateAndProcessFile]
  );

  return (
    <div
      className={`flex justify-center p-8 border-2 border-dashed rounded-[6px] ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={triggerFileInput}
      style={{
        borderColor: isDragging
          ? cssVarV2('button/primary')
          : cssVarV2('layer/insideBorder/blackBorder'),
      }}
    >
      <div className="text-center">
        <UploadIcon
          fontSize={24}
          className="mx-auto mb-3"
          style={{
            color: cssVarV2('selfhost/icon/secondary'),
          }}
        />
        <div
          className="text-xs font-medium"
          style={{ color: cssVarV2('text/secondary') }}
        >
          {isDragging
            ? 'Release mouse to upload file'
            : 'Upload your CSV file or drag it here'}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {isDragging ? 'Preparing to upload...' : ''}
        </p>
      </div>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".csv"
        className="hidden"
      />
    </div>
  );
});

FileUploadArea.displayName = 'FileUploadArea';
