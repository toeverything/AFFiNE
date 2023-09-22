import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { EdgelessIcon } from '@blocksuite/icons';
import { registerAffineCommand } from '@toeverything/infra/command';
import { useEffect } from 'react';

export function useRegisterBlocksuiteEditorCommands() {
  const t = useAFFiNEI18N();
  useEffect(() => {
    const unsubs: Array<() => void> = [];
    const getEdgeless = () => {
      return document.querySelector('affine-edgeless-page');
    };
    unsubs.push(
      registerAffineCommand({
        id: 'editor:edgeless-presentation-start',
        preconditionStrategy: () => !!getEdgeless(),
        category: 'editor:edgeless',
        icon: <EdgelessIcon />,
        label: t['com.affine.cmdk.affine.editor.edgeless.presentation-start'](),
        run() {
          // this is pretty hack and easy to break. need a better way to communicate with blocksuite editor
          document
            .querySelector<HTMLElement>('edgeless-toolbar')
            ?.shadowRoot?.querySelector<HTMLElement>(
              '.edgeless-toolbar-left-part > edgeless-tool-icon-button:last-child'
            )
            ?.click();
        },
      })
    );
    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [t]);
}
