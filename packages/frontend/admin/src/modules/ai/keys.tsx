import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { useState } from 'react';

export function Keys() {
  const [openAIKey, setOpenAIKey] = useState('');
  const [falAIKey, setFalAIKey] = useState('');
  const [unsplashKey, setUnsplashKey] = useState('');

  return (
    <div className="flex flex-col h-full gap-3 py-5 px-6 w-full">
      <div className="flex items-center">
        <span className="text-xl font-semibold">Keys</span>
      </div>
      <div className="flex-grow overflow-y-auto space-y-[10px]">
        <div className="flex flex-col rounded-md border py-4 gap-4">
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">OpenAI Key</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                value={openAIKey}
                placeholder="sk-xxxxxxxxxxxxx-xxxxxxxxxxxxxx"
                onChange={e => setOpenAIKey(e.target.value)}
              />
              <Button disabled>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Fal.AI Key</Label>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                className="py-2 px-3 ext-base font-normal placeholder:opacity-50"
                value={falAIKey}
                placeholder="00000000-0000-0000-00000000:xxxxxxxxxxxxxxxxx"
                onChange={e => setFalAIKey(e.target.value)}
              />
              <Button disabled>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Unsplash Key</Label>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                className="py-2 px-3 ext-base font-normal placeholder:opacity-50"
                value={unsplashKey}
                placeholder="00000000-0000-0000-00000000:xxxxxxxxxxxxxxxxx"
                onChange={e => setUnsplashKey(e.target.value)}
              />
              <Button disabled>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3 text-sm font-normal text-gray-500">
            Custom API keys may not perform as expected. AFFiNE does not
            guarantee results when using custom API keys.
          </div>
        </div>
      </div>
    </div>
  );
}
