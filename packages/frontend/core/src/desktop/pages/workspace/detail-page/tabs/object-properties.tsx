import {
  ConnectorElementModel,
  ShapeElementModel,
} from '@blocksuite/affine/model';
import type { EditorHost } from '@blocksuite/affine/std';
import {
  GfxControllerIdentifier,
  type GfxModel,
} from '@blocksuite/affine/std/gfx';
import { useEffect, useRef, useState } from 'react';

type PropertiesModalElement = HTMLElement & {
  host: EditorHost;
  model: GfxModel;
  inline: boolean;
  abortController: AbortController | null;
  requestUpdate?: () => void;
};

export const EditorObjectPropertiesPanel = ({
  editor,
}: {
  editor: EditorHost | null;
}) => {
  const [selectedModel, setSelectedModel] = useState<GfxModel | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const refreshTimerRef = useRef<number | null>(null);

  const getSupportedSelection = (host: EditorHost): GfxModel | null => {
    const gfx = host.std.get(GfxControllerIdentifier);
    const selected = gfx.selection.selectedElements as GfxModel[];
    if (selected.length !== 1) return null;
    const model = selected[0];
    if (
      !(model instanceof ShapeElementModel) &&
      !(model instanceof ConnectorElementModel)
    ) {
      return null;
    }
    return model;
  };

  useEffect(() => {
    if (!editor) {
      setSelectedModel(null);
      return;
    }

    setSelectedModel(getSupportedSelection(editor));
    const gfx = editor.std.get(GfxControllerIdentifier);
    const s1 = gfx.selection.slots.updated.subscribe(() => {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        setSelectedModel(getSupportedSelection(editor));
      }, 120);
    });

    const s2 = gfx.surface?.elementUpdated.subscribe(payload => {
      const current = getSupportedSelection(editor);
      if (!current) return;
      if (payload.id !== current.id) return;
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = window.setTimeout(() => {
        setRefreshVersion(v => v + 1);
      }, 120);
    });

    return () => {
      if (settleTimerRef.current) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      s1.unsubscribe();
      s2?.unsubscribe();
    };
  }, [editor]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !editor) return;

    if (!selectedModel) {
      mount.replaceChildren();
      return;
    }

    const current = mount.firstElementChild as PropertiesModalElement | null;
    if (current?.tagName.toLowerCase() === 'properties-modal') {
      current.host = editor;
      current.model = selectedModel;
      current.requestUpdate?.();
      return;
    }

    mount.replaceChildren();
    const panel = document.createElement(
      'properties-modal'
    ) as PropertiesModalElement;
    panel.host = editor;
    panel.model = selectedModel;
    panel.inline = true;
    panel.abortController = null;
    panel.style.position = 'static';
    panel.style.inset = 'auto';
    panel.style.display = 'block';
    panel.style.width = '100%';
    panel.style.padding = '0';
    panel.style.overflow = 'visible';
    panel.style.background = 'transparent';
    mount.append(panel);
  }, [editor, selectedModel, refreshVersion]);

  if (!editor || !selectedModel) {
    return null;
  }

  return (
    <div
      ref={mountRef}
      style={{
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        paddingTop: 8,
        paddingBottom: 64,
        paddingLeft: 8,
        paddingRight: 8,
        position: 'relative',
      }}
    />
  );
};
