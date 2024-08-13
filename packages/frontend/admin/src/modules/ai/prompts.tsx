import { Button } from '@affine/admin/components/ui/button';
import { Separator } from '@affine/admin/components/ui/separator';
import type { CopilotPromptMessageRole } from '@affine/graphql';
import { useCallback, useState } from 'react';

import { useRightPanel } from '../layout';
import { DiscardChanges } from './discard-changes';
import { EditPrompt } from './edit-prompt';
import { usePrompt } from './use-prompt';

export type Prompt = {
  __typename?: 'CopilotPromptType';
  name: string;
  model: string;
  action: string | null;
  config: {
    __typename?: 'CopilotPromptConfigType';
    jsonMode: boolean | null;
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
              key={item.name.concat(index.toString())}
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
  const { setRightPanelContent, openPanel, isOpen } = useRightPanel();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleDiscardChangesCancel = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleConfirm = useCallback(
    (item: Prompt) => {
      setRightPanelContent(<EditPrompt item={item} />);
      if (dialogOpen) {
        handleDiscardChangesCancel();
      }

      if (!isOpen) {
        openPanel();
      }
    },
    [
      dialogOpen,
      handleDiscardChangesCancel,
      isOpen,
      openPanel,
      setRightPanelContent,
    ]
  );

  const handleEdit = useCallback(
    (item: Prompt) => {
      if (isOpen) {
        setDialogOpen(true);
      } else {
        handleConfirm(item);
      }
    },
    [handleConfirm, isOpen]
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
