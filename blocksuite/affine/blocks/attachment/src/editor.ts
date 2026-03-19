import type { AttachmentBlockComponent } from './attachment-block';
type AttachmentEditorDialogModule = typeof import('./components/editor-dialog');

export async function openAttachmentEditor(
  block: AttachmentBlockComponent
): Promise<void> {
  try {
    const module = await new Promise<AttachmentEditorDialogModule>(
      (resolve, reject) => {
        import('./components/editor-dialog')
          .then(resolved => {
            resolve(resolved as AttachmentEditorDialogModule);
          })
          .catch(error => {
            console.error('Failed to load editor dialog module:', error);
            reject(error);
          });
      }
    );

    if (typeof module.createAttachmentEditorDialog === 'function') {
      module.createAttachmentEditorDialog(block);
    } else {
      console.error('Attachment editor dialog module missing create function');
      throw new Error('Editor dialog function not found');
    }
  } catch (error) {
    console.error('Error in openAttachmentEditor:', error);
    throw error;
  }
}
