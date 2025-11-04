import { Button } from '@affine/admin/components/ui/button';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import { Separator } from '@affine/admin/components/ui/separator';
import { useEffect, useState } from 'react';
import { Input as TextInput } from '@affine/admin/components/ui/input';
import { useAppConfig } from '../settings/use-app-config';

export function Keys() {
  const { appConfig, update, save } = useAppConfig();

  const [openAIKey, setOpenAIKey] = useState('');
  const [openAIBaseURL, setOpenAIBaseURL] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [anthropicBaseURL, setAnthropicBaseURL] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [perplexityKey, setPerplexityKey] = useState('');
  const [falAIKey, setFalAIKey] = useState('');
  const [unsplashKey, setUnsplashKey] = useState('');

  useEffect(() => {
    setOpenAIKey(appConfig?.copilot?.providers?.openai?.apiKey ?? '');
    setOpenAIBaseURL(appConfig?.copilot?.providers?.openai?.baseURL ?? '');
    setAnthropicKey(appConfig?.copilot?.providers?.anthropic?.apiKey ?? '');
    setAnthropicBaseURL(appConfig?.copilot?.providers?.anthropic?.baseURL ?? '');
    setGeminiKey(appConfig?.copilot?.providers?.gemini?.apiKey ?? '');
    setPerplexityKey(appConfig?.copilot?.providers?.perplexity?.apiKey ?? '');
    setFalAIKey(appConfig?.copilot?.providers?.fal?.apiKey ?? '');
    setUnsplashKey(appConfig?.copilot?.unsplash?.apiKey ?? '');
  }, [appConfig]);

  const onSaveOpenAI = async () => {
    update('copilot/providers.openai/apiKey', openAIKey || '');
    update('copilot/providers.openai/baseURL', openAIBaseURL || '');
    await save();
  };
  const onSaveAnthropic = async () => {
    update('copilot/providers.anthropic/apiKey', anthropicKey || '');
    update('copilot/providers.anthropic/baseURL', anthropicBaseURL || '');
    await save();
  };
  const onSaveGemini = async () => {
    update('copilot/providers.gemini/apiKey', geminiKey || '');
    await save();
  };
  const onSavePerplexity = async () => {
    update('copilot/providers.perplexity/apiKey', perplexityKey || '');
    await save();
  };
  const onSaveFal = async () => {
    update('copilot/providers.fal/apiKey', falAIKey || '');
    await save();
  };
  const onSaveUnsplash = async () => {
    update('copilot/unsplash/apiKey', unsplashKey || '');
    await save();
  };

  return (
    <div className="flex flex-col h-full gap-3 py-5 px-6 w-full">
      <div className="flex items-center">
        <span className="text-xl font-semibold">Keys</span>
      </div>
      <div className="flex-grow overflow-y-auto space-y-[10px]">
        <div className="flex flex-col rounded-md border py-4 gap-4">
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">OpenAI</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                  value={openAIKey}
                  placeholder="sk-xxxxxxxxxxxxx-xxxxxxxxxxxxxx"
                  onChange={e => setOpenAIKey(e.target.value)}
                />
                <Button onClick={onSaveOpenAI}>Save</Button>
              </div>
              <div className="flex items-center gap-2">
                <TextInput
                  type="text"
                  className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                  value={openAIBaseURL}
                  placeholder="https://api.openai.com/v1 (or OpenRouter/Azure base URL)"
                  onChange={e => setOpenAIBaseURL(e.target.value)}
                />
              </div>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Anthropic</Label>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                  value={anthropicKey}
                  placeholder="anthropic-key"
                  onChange={e => setAnthropicKey(e.target.value)}
                />
                <Button onClick={onSaveAnthropic}>Save</Button>
              </div>
              <div className="flex items-center gap-2">
                <TextInput
                  type="text"
                  className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                  value={anthropicBaseURL}
                  placeholder="https://api.anthropic.com/v1 (optional)"
                  onChange={e => setAnthropicBaseURL(e.target.value)}
                />
              </div>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Google Gemini</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                value={geminiKey}
                placeholder="gemini-key"
                onChange={e => setGeminiKey(e.target.value)}
              />
              <Button onClick={onSaveGemini}>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Perplexity</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                className="py-2 px-3 text-base font-normal placeholder:opacity-50"
                value={perplexityKey}
                placeholder="perplexity-key"
                onChange={e => setPerplexityKey(e.target.value)}
              />
              <Button onClick={onSavePerplexity}>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Fal.AI</Label>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                className="py-2 px-3 ext-base font-normal placeholder:opacity-50"
                value={falAIKey}
                placeholder="00000000-0000-0000-00000000:xxxxxxxxxxxxxxxxx"
                onChange={e => setFalAIKey(e.target.value)}
              />
              <Button onClick={onSaveFal}>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3">
            <Label className="text-sm font-medium">Unsplash</Label>
            <div className="flex items-center gap-2">
              <Input
                type="password"
                className="py-2 px-3 ext-base font-normal placeholder:opacity-50"
                value={unsplashKey}
                placeholder="unsplash-access-key"
                onChange={e => setUnsplashKey(e.target.value)}
              />
              <Button onClick={onSaveUnsplash}>Save</Button>
            </div>
          </div>
          <Separator />
          <div className="px-5 space-y-3 text-sm font-normal text-gray-500">
            Custom API keys and base URLs are supported. For OpenAI-compatible
            providers (e.g., OpenRouter, Azure OpenAI), set the base URL.
          </div>
        </div>
      </div>
    </div>
  );
}
