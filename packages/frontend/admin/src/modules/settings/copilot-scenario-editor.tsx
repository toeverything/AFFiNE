import { Label } from '@affine/admin/components/ui/label';
import { Switch } from '@affine/admin/components/ui/switch';
import { useCallback } from 'react';

import { ModelCombobox } from './model-combobox';
import { useCopilotModels } from './use-copilot-models';

const SCENARIO_KEYS = [
  'chat',
  'coding',
  'complex_text_generation',
  'quick_decision_making',
  'quick_text_generation',
  'polish_and_summarize',
  'image',
  'embedding',
  'audio_transcribing',
  'rerank',
] as const;

const SCENARIO_LABELS: Record<string, string> = {
  chat: 'Chat',
  coding: 'Coding',
  complex_text_generation: 'Complex Text Generation',
  quick_decision_making: 'Quick Decision Making',
  quick_text_generation: 'Quick Text Generation',
  polish_and_summarize: 'Polish & Summarize',
  image: 'Image',
  embedding: 'Embedding',
  audio_transcribing: 'Audio Transcription',
  rerank: 'Rerank',
};

type ScenariosConfig = {
  override_enabled?: boolean;
  scenarios?: Record<string, string>;
};

export function CopilotScenarioEditor({
  value,
  onChange,
}: {
  value: ScenariosConfig;
  onChange: (value: ScenariosConfig) => void;
}) {
  const { groups, loading } = useCopilotModels();
  const overrideEnabled = value?.override_enabled ?? false;
  const scenarios = value?.scenarios ?? {};

  const handleToggle = useCallback(
    (checked: boolean) => {
      onChange({ ...value, override_enabled: checked });
    },
    [value, onChange]
  );

  const handleModelChange = useCallback(
    (scenario: string, model: string) => {
      onChange({
        ...value,
        scenarios: {
          ...value?.scenarios,
          [scenario]: model,
        },
      });
    },
    [value, onChange]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold leading-6 text-foreground">
          Scenario Model Overrides
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="scenario-override-toggle" className="text-sm">
            Enable Overrides
          </Label>
          <Switch
            id="scenario-override-toggle"
            checked={overrideEnabled}
            onCheckedChange={handleToggle}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading models...</div>
      ) : (
        <div className="flex flex-col gap-3">
          {SCENARIO_KEYS.map(scenario => (
            <div key={scenario} className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">
                {SCENARIO_LABELS[scenario] ?? scenario}
              </Label>
              <ModelCombobox
                value={scenarios[scenario] ?? ''}
                onChange={model => handleModelChange(scenario, model)}
                groups={groups}
                placeholder="Default (auto)"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
