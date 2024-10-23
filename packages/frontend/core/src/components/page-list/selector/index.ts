import { SelectCollection } from '../collections';
import { SelectPage } from '../docs/select-page';
import { SelectTag } from '../tags';
import { useSelectDialog } from './use-select-dialog';

export interface BaseSelectorDialogProps<T> {
  init?: T;
  onConfirm?: (data: T) => void;
  onCancel?: () => void;
}

/**
 * Return a `open` function to open the select collection dialog.
 */
export const useSelectCollection = () => {
  return useSelectDialog(SelectCollection, 'select-collection');
};

/**
 * Return a `open` function to open the select page dialog.
 */
export const useSelectDoc = () => {
  return useSelectDialog(SelectPage, 'select-doc-dialog');
};

/**
 * Return a `open` function to open the select tag dialog.
 */
export const useSelectTag = () => {
  return useSelectDialog(SelectTag, 'select-tag-dialog');
};
