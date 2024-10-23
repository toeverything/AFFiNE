import { Scrollable } from '@affine/component';
import { ThemeEditorService } from '@affine/core/modules/theme-editor';
import { useLiveData, useService } from '@toeverything/infra';

import type { TreeNode } from '../resource';
import * as styles from '../theme-editor.css';
import { isColor } from '../utils';
import { ColorCell } from './color-cell';
import { StringCell } from './string-cell';

export const VariableList = ({ node }: { node: TreeNode }) => {
  const themeEditor = useService(ThemeEditorService);
  const customTheme = useLiveData(themeEditor.customTheme$);

  const variables = node.variables ?? [];

  return (
    <main className={styles.content}>
      <header>
        <ul className={styles.row}>
          <li>Name</li>
          <li>Light</li>
          <li>Dark</li>
        </ul>
      </header>
      <Scrollable.Root className={styles.mainScrollable}>
        <Scrollable.Viewport className={styles.mainViewport}>
          {variables.map(variable => (
            <ul className={styles.row} key={variable.variableName}>
              <li
                style={{
                  textDecoration:
                    customTheme?.light?.[variable.variableName] ||
                    customTheme?.dark?.[variable.variableName]
                      ? 'underline'
                      : 'none',
                }}
              >
                {variable.name}
              </li>
              {(['light', 'dark'] as const).map(mode => {
                const Renderer = isColor(variable[mode])
                  ? ColorCell
                  : StringCell;
                return (
                  <li key={mode}>
                    <Renderer
                      value={variable[mode]}
                      custom={customTheme?.[mode]?.[variable.variableName]}
                      onValueChange={color =>
                        themeEditor.updateCustomTheme(
                          mode,
                          variable.variableName,
                          color
                        )
                      }
                    />
                  </li>
                );
              })}
            </ul>
          ))}
        </Scrollable.Viewport>
        <Scrollable.Scrollbar />
      </Scrollable.Root>
    </main>
  );
};
