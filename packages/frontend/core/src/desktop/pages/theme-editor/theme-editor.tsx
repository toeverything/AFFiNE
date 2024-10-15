import { RadioGroup, Scrollable } from '@affine/component';
import { ThemeEditorService } from '@affine/core/modules/theme-editor';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { ThemeEmpty } from './components/empty';
import { ThemeTreeNode } from './components/tree-node';
import { VariableList } from './components/variable-list';
import { affineThemes, type TreeNode } from './resource';
import * as styles from './theme-editor.css';

export const ThemeEditor = () => {
  const themeEditor = useService(ThemeEditorService);
  const [version, setVersion] = useState<'v1' | 'v2'>('v1');
  const [activeNode, setActiveNode] = useState<TreeNode | null>();

  const { nodeMap, variableMap, tree } = affineThemes[version];

  const [customizedNodeIds, setCustomizedNodeIds] = useState<Set<string>>(
    new Set()
  );

  // workaround for the performance issue of using `useLiveData(themeEditor.customTheme$)` here
  useEffect(() => {
    const sub = themeEditor.customTheme$.subscribe(customTheme => {
      const ids = Array.from(
        new Set([
          ...Object.keys(customTheme?.light ?? {}),
          ...Object.keys(customTheme?.dark ?? {}),
        ])
      ).reduce((acc, name) => {
        const variable = variableMap.get(name);
        if (!variable) return acc;
        variable.ancestors.forEach(id => acc.add(id));
        return acc;
      }, new Set<string>());

      setCustomizedNodeIds(prev => {
        const isSame =
          Array.from(ids).every(id => prev.has(id)) &&
          Array.from(prev).every(id => ids.has(id));
        return isSame ? prev : ids;
      });
    });
    return () => sub.unsubscribe();
  }, [themeEditor.customTheme$, variableMap]);

  const onToggleVersion = useCallback((v: 'v1' | 'v2') => {
    setVersion(v);
    setActiveNode(null);
  }, []);

  const isActive = useCallback(
    (node: TreeNode) => {
      let pointer = activeNode;
      while (pointer) {
        if (!pointer) return false;
        if (pointer === node) return true;
        pointer = pointer.parentId ? nodeMap.get(pointer.parentId) : undefined;
      }
      return false;
    },
    [activeNode, nodeMap]
  );

  const isCustomized = useCallback(
    (node: TreeNode) => customizedNodeIds.has(node.id),
    [customizedNodeIds]
  );

  return (
    <div className={styles.root}>
      <div className={styles.sidebar}>
        <header className={styles.sidebarHeader}>
          <RadioGroup
            width="100%"
            value={version}
            onChange={onToggleVersion}
            items={['v1', 'v2']}
          />
        </header>
        <Scrollable.Root className={styles.sidebarScrollable} key={version}>
          <Scrollable.Viewport>
            {tree.map(node => (
              <ThemeTreeNode
                key={node.id}
                node={node}
                checked={activeNode ?? undefined}
                setActive={setActiveNode}
                isActive={isActive}
                isCustomized={isCustomized}
              />
            ))}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>
      </div>
      {activeNode ? <VariableList node={activeNode} /> : <ThemeEmpty />}
    </div>
  );
};
