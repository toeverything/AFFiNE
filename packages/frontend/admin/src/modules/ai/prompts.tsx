import { Button } from '@affine/admin/components/ui/button';
import { Separator } from '@affine/admin/components/ui/separator';
import type { CopilotPromptMessageRole } from '@affine/graphql';
import { useCallback, useState } from 'react';

import { DiscardChanges } from '../../components/shared/discard-changes';
import { useRightPanel } from '../panel/context';
import { EditPrompt } from './edit-prompt';
import { usePrompt } from './use-prompt';

export type Prompt = {
  __typename?: 'CopilotPromptType';
  name: string;
  model: string;
  action: string | null;
  config: {
    __typename?: 'CopilotPromptConfigType';
    frequencyPenalty: number | null;
    presencePenalty: number | null;
    temperature: number | null;
    topP: number | null;
  } | null;
  messages: Array<{
    __typename?: 'CopilotPromptMessageType';
    role: CopilotPromptMessageRole;
    content: string;
    params: Record<string, string> | null;
  }>;
};

export function Prompts() {
  const { prompts: list } = usePrompt();
  return (
    <div className="flex flex-col h-full gap-3 py-5 px-6 w-full">
      <div className="flex items-center">
        <span className="text-xl font-semibold">Prompts</span>
      </div>
      <div className="flex-grow overflow-y-auto space-y-[10px]">
        <div className="flex flex-col rounded-md border w-full">
          {list.map((item, index) => (
            <PromptRow
              key={`${item.name}-${index}`}
              item={item}
              index={index}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const PromptRow = ({ item, index }: { item: Prompt; index: number }) => {
  const { setPanelContent, openPanel, isOpen } = useRightPanel();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [canSave, setCanSave] = useState(false);

  const handleDiscardChangesCancel = useCallback(() => {
    setDialogOpen(false);
    setCanSave(false);
  }, []);

  const handleConfirm = useCallback(
    (item: Prompt) => {
      setPanelContent(<EditPrompt item={item} setCanSave={setCanSave} />);
      if (dialogOpen) {
        handleDiscardChangesCancel();
      }

      if (!isOpen) {
        openPanel();
      }
    },
    [dialogOpen, handleDiscardChangesCancel, isOpen, openPanel, setPanelContent]
  );

  const handleEdit = useCallback(
    (item: Prompt) => {
      if (isOpen && canSave) {
        setDialogOpen(true);
      } else {
        handleConfirm(item);
      }
    },
    [canSave, handleConfirm, isOpen]
  );
  return (
    <div>
      {index !== 0 && <Separator />}
      <Button
        variant="ghost"
        className="flex flex-col gap-1 w-full items-start px-6 py-[14px] h-full "
        onClick={() => handleEdit(item)}
      >
        <div>{item.name}</div>
        <div className="text-left w-full opacity-50 overflow-hidden text-ellipsis whitespace-nowrap break-words text-nowrap">
          {item.messages.flatMap(message => message.content).join(' ')}
        </div>
      </Button>
      <DiscardChanges
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onClose={handleDiscardChangesCancel}
        onConfirm={() => handleConfirm(item)}
      />
    </div>
  );
};
