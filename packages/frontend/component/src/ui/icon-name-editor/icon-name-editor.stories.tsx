import type { Meta, StoryFn } from '@storybook/react';
import { useCallback, useState } from 'react';

import { Button } from '../button';
import { ResizePanel } from '../resize-panel/resize-panel';
import {
  IconAndNameEditorMenu,
  type IconAndNameEditorMenuProps,
  IconEditor,
  type IconType,
} from './icon-name-editor';

export default {
  title: 'UI/IconAndNameEditorMenu',
  component: IconAndNameEditorMenu,
} satisfies Meta<typeof IconAndNameEditorMenu>;

export const Basic: StoryFn<IconAndNameEditorMenuProps> = () => {
  const [icon, setIcon] = useState<string>('👋');
  const [name, setName] = useState<string>('Hello');

  const handleIconChange = useCallback((_: IconType, icon: string) => {
    setIcon(icon);
  }, []);
  const handleNameChange = useCallback((name: string) => {
    setName(name);
  }, []);

  return (
    <div>
      <p>Icon: {icon}</p>
      <p>Name: {name}</p>

      <ResizePanel
        maxWidth={1200}
        maxHeight={800}
        width={220}
        height={44}
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'end',
          alignItems: 'end',
        }}
      >
        <IconAndNameEditorMenu
          iconType="emoji"
          icon={icon}
          name={name}
          onIconChange={handleIconChange}
          onNameChange={handleNameChange}
        >
          <Button>Edit Name and Icon</Button>
        </IconAndNameEditorMenu>

        <IconEditor
          iconType="emoji"
          icon={icon}
          onIconChange={handleIconChange}
          closeAfterSelect
        />
      </ResizePanel>
    </div>
  );
};
