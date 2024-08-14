import { Separator } from '@affine/admin/components/ui/separator';
import { cn } from '@affine/admin/utils';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { Prompts } from './prompts';

function AiPage() {
  return (
    <div className=" h-screen flex-1 flex-col flex">
      <div className="flex items-center justify-between px-6 py-3 my-[2px] max-md:ml-9 max-md:mt-[2px]">
        <div className="text-base font-medium">AI</div>
      </div>
      <Separator />
      <ScrollAreaPrimitive.Root
        className={cn('relative overflow-hidden w-full')}
      >
        <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
          <Prompts />
        </ScrollAreaPrimitive.Viewport>
        <ScrollAreaPrimitive.ScrollAreaScrollbar
          className={cn(
            'flex touch-none select-none transition-colors',

            'h-full w-2.5 border-l border-l-transparent p-[1px]'
          )}
        >
          <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
        </ScrollAreaPrimitive.ScrollAreaScrollbar>
        <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
    </div>
  );
}

export { AiPage as Component };
