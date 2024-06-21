import { useActiveBlocksuiteEditor } from '@affine/core/hooks/use-block-suite-editor';
import type { EdgelessRootService } from '@blocksuite/blocks';
import { useCallback, useEffect, useState } from 'react';

export const usePresent = () => {
  const [isPresent, setIsPresent] = useState(false);
  const [editor] = useActiveBlocksuiteEditor();

  const handlePresent = useCallback(
    (enable = true) => {
      isPresent;
      const editorHost = editor?.host;
      if (!editorHost) return;

      // TODO(@catsjuice): use surfaceService subAtom
      const enterOrLeavePresentationMode = () => {
        const edgelessRootService = editorHost.spec.getService(
          'affine:page'
        ) as EdgelessRootService;

        if (!edgelessRootService) {
          return;
        }

        const activeTool = edgelessRootService.tool.edgelessTool.type;
        const isFrameNavigator = activeTool === 'frameNavigator';
        if ((enable && isFrameNavigator) || (!enable && !isFrameNavigator))
          return;

        edgelessRootService.tool.setEdgelessTool({
          type: enable ? 'frameNavigator' : 'default',
        });
      };

      enterOrLeavePresentationMode();
      setIsPresent(enable);
    },
    [editor?.host, isPresent]
  );

  useEffect(() => {
    if (!isPresent) return;

    const editorHost = editor?.host;
    if (!editorHost) return;

    const edgelessPage = editorHost?.querySelector('affine-edgeless-root');
    if (!edgelessPage) return;

    return edgelessPage.slots.edgelessToolUpdated.on(() => {
      setIsPresent(edgelessPage.edgelessTool.type === 'frameNavigator');
    }).dispose;
  }, [editor?.host, isPresent]);

  return {
    isPresent,
    handlePresent,
  };
};
