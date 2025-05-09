import { Switch } from '@affine/admin/components/ui/switch';
import { cn } from '@affine/admin/utils';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { useState } from 'react';

import { Header } from '../header';

function AiPage() {
  const [enableAi, setEnableAi] = useState(false);

  return (
    <div className="h-screen flex-1 flex-col flex">
      <Header title="AI" />
      <ScrollAreaPrimitive.Root
        className={cn('relative overflow-hidden w-full')}
      >
        <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
          <div className="p-6 max-w-3xl mx-auto">
            <div className="text-[20px]">AI</div>
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[15px] font-medium mt-6">Enable AI</p>
                <p className="text-sm text-muted-foreground mt-1">
                  AI functionality is not currently supported. Self-hosted AI
                  support is in progress.
                </p>
              </div>
              <Switch
                checked={enableAi}
                onCheckedChange={setEnableAi}
                disabled={true}
              />
            </div>
          </div>
          {/* <Prompts /> */}
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
