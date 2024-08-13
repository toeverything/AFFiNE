import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/hooks/use-mutation';
import { useQuery } from '@affine/core/hooks/use-query';
import { getPromptsQuery, updatePromptMutation } from '@affine/graphql';
import { toast } from 'sonner';

import type { Prompt } from './prompts';

export const usePrompt = () => {
  const { data } = useQuery({
    query: getPromptsQuery,
  });

  const { trigger } = useMutation({
    mutation: updatePromptMutation,
  });

  const revalidate = useMutateQueryResource();

  const updatePrompt = useAsyncCallback(
    async ({
      name,
      messages,
    }: {
      name: string;
      messages: Prompt['messages'];
    }) => {
      await trigger({
        name,
        messages,
      })
        .then(async () => {
          await revalidate(getPromptsQuery);
          toast.success('Prompt updated successfully');
        })
        .catch(e => {
          toast(e.message);
          console.error(e);
        });
    },
    [revalidate, trigger]
  );

  return {
    prompts: data.listCopilotPrompts,
    updatePrompt,
  };
};
