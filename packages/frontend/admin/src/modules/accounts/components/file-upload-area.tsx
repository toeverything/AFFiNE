import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { UploadIcon } from '@blocksuite/icons/rc';
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
      className={`flex justify-center p-8 border-2 border-dashed rounded-md ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={triggerFileInput}
    >
      <div className="text-center">
        <UploadIcon fontSize={36} className="mx-auto mb-2 text-gray-400" />
        <div className="text-sm font-medium">
          {isDragging
            ? 'Release mouse to upload file'
            : 'Click to upload CSV file'}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {isDragging ? 'Preparing to upload...' : 'Or drag and drop file here'}
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
