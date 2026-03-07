import { Badge } from '@affine/admin/components/ui/badge';
import { Button } from '@affine/admin/components/ui/button';
import { Card } from '@affine/admin/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@affine/admin/components/ui/dialog';
import { Input } from '@affine/admin/components/ui/input';
import { Label } from '@affine/admin/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@affine/admin/components/ui/select';
import { Switch } from '@affine/admin/components/ui/switch';
import { cn } from '@affine/admin/utils';
import { useCallback, useMemo, useState } from 'react';

const PROVIDER_TYPES = [
  'openai',
  'fal',
  'gemini',
  'geminiVertex',
  'perplexity',
  'anthropic',
  'anthropicVertex',
  'morph',
] as const;

type ProviderType = (typeof PROVIDER_TYPES)[number];

const PROVIDER_LABELS: Record<ProviderType, string> = {
  openai: 'OpenAI',
  fal: 'FAL',
  gemini: 'Gemini',
  geminiVertex: 'Gemini (Vertex AI)',
  perplexity: 'Perplexity',
  anthropic: 'Anthropic',
  anthropicVertex: 'Anthropic (Vertex AI)',
  morph: 'Morph',
};

type ProviderConfigField = {
  key: string;
  label: string;
  type: 'text' | 'url' | 'password' | 'boolean';
  required?: boolean;
  placeholder?: string;
};

const PROVIDER_CONFIG_FIELDS: Record<ProviderType, ProviderConfigField[]> = {
  openai: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sk-...',
    },
    {
      key: 'baseURL',
      label: 'Base URL',
      type: 'url',
      placeholder: 'https://api.openai.com/v1',
    },
    {
      key: 'oldApiStyle',
      label: 'Use Chat Completions API (legacy)',
      type: 'boolean',
    },
  ],
  fal: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
  ],
  gemini: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
    {
      key: 'baseURL',
      label: 'Base URL',
      type: 'url',
      placeholder: 'https://generativelanguage.googleapis.com/v1beta',
    },
  ],
  geminiVertex: [
    { key: 'location', label: 'Location', type: 'text', required: true },
    { key: 'project', label: 'Project', type: 'text' },
    { key: 'baseURL', label: 'Base URL', type: 'url' },
  ],
  perplexity: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
    },
    { key: 'endpoint', label: 'Endpoint', type: 'url' },
  ],
  anthropic: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'password',
      required: true,
      placeholder: 'sk-ant-...',
    },
    {
      key: 'baseURL',
      label: 'Base URL',
      type: 'url',
      placeholder: 'https://api.anthropic.com/v1',
    },
  ],
  anthropicVertex: [
    { key: 'location', label: 'Location', type: 'text', required: true },
    { key: 'project', label: 'Project', type: 'text' },
    { key: 'baseURL', label: 'Base URL', type: 'url' },
  ],
  morph: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
};

type Profile = {
  id: string;
  type: ProviderType;
  displayName?: string;
  priority?: number;
  enabled?: boolean;
  config: Record<string, unknown>;
};

type ProfileFormData = {
  id: string;
  type: ProviderType;
  displayName: string;
  priority: number;
  enabled: boolean;
  config: Record<string, string>;
};

function newProfileForm(type: ProviderType = 'openai'): ProfileFormData {
  return {
    id: '',
    type,
    displayName: '',
    priority: 0,
    enabled: true,
    config: {},
  };
}

function profileToForm(profile: Profile): ProfileFormData {
  const config: Record<string, string> = {};
  for (const [k, v] of Object.entries(profile.config)) {
    if (typeof v === 'boolean') {
      config[k] = String(v);
    } else {
      config[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
  }
  return {
    id: profile.id,
    type: profile.type,
    displayName: profile.displayName ?? '',
    priority: profile.priority ?? 0,
    enabled: profile.enabled !== false,
    config,
  };
}

function formToProfile(form: ProfileFormData): Profile {
  const config: Record<string, unknown> = {};
  const fields = PROVIDER_CONFIG_FIELDS[form.type] ?? [];
  for (const field of fields) {
    const value = form.config[field.key];
    if (field.type === 'boolean') {
      if (value === 'true') config[field.key] = true;
      // omit false/undefined to keep config minimal
    } else if (value !== undefined && value !== '') {
      config[field.key] = value;
    }
  }
  return {
    id: form.id,
    type: form.type,
    displayName: form.displayName || undefined,
    priority: form.priority,
    enabled: form.enabled,
    config,
  };
}

function validateForm(form: ProfileFormData): string | null {
  if (!form.id) return 'Profile ID is required';
  if (!/^[a-zA-Z0-9-_]+$/.test(form.id))
    return 'Profile ID may only contain letters, numbers, hyphens, and underscores';
  return null;
}

function ProfileDialog({
  open,
  onOpenChange,
  title,
  form,
  onFormChange,
  onSave,
  existingIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: ProfileFormData;
  onFormChange: (form: ProfileFormData) => void;
  onSave: () => void;
  existingIds: Set<string>;
}) {
  const error = useMemo(() => {
    const base = validateForm(form);
    if (base) return base;
    if (existingIds.has(form.id))
      return 'A profile with this ID already exists';
    return null;
  }, [form, existingIds]);

  const fields = PROVIDER_CONFIG_FIELDS[form.type] ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-id">Profile ID</Label>
            <Input
              id="profile-id"
              value={form.id}
              onChange={e => onFormChange({ ...form, id: e.target.value })}
              placeholder="e.g. openai-primary"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-type">Provider Type</Label>
            <Select
              value={form.type}
              onValueChange={type =>
                onFormChange({
                  ...form,
                  type: type as ProviderType,
                  config: {},
                })
              }
            >
              <SelectTrigger id="profile-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_TYPES.map(t => (
                  <SelectItem key={t} value={t}>
                    {PROVIDER_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="profile-display-name">Display Name</Label>
            <Input
              id="profile-display-name"
              value={form.displayName}
              onChange={e =>
                onFormChange({ ...form, displayName: e.target.value })
              }
              placeholder="Optional"
            />
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="profile-priority">Priority</Label>
              <Input
                id="profile-priority"
                type="number"
                value={form.priority}
                onChange={e =>
                  onFormChange({
                    ...form,
                    priority: parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5 items-center">
              <Label>Enabled</Label>
              <Switch
                checked={form.enabled}
                onCheckedChange={enabled => onFormChange({ ...form, enabled })}
              />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="text-sm font-semibold mb-3">
              Provider Configuration
            </div>
            <div className="flex flex-col gap-3">
              {fields.map(field =>
                field.type === 'boolean' ? (
                  <div
                    key={field.key}
                    className="flex items-center justify-between"
                  >
                    <Label htmlFor={`config-${field.key}`}>{field.label}</Label>
                    <Switch
                      id={`config-${field.key}`}
                      checked={form.config[field.key] === 'true'}
                      onCheckedChange={checked =>
                        onFormChange({
                          ...form,
                          config: {
                            ...form.config,
                            [field.key]: String(checked),
                          },
                        })
                      }
                    />
                  </div>
                ) : (
                  <div key={field.key} className="flex flex-col gap-1.5">
                    <Label htmlFor={`config-${field.key}`}>
                      {field.label}
                      {field.required && (
                        <span className="text-destructive ml-0.5">*</span>
                      )}
                    </Label>
                    <Input
                      id={`config-${field.key}`}
                      type={field.type === 'password' ? 'password' : 'text'}
                      value={form.config[field.key] ?? ''}
                      onChange={e =>
                        onFormChange({
                          ...form,
                          config: {
                            ...form.config,
                            [field.key]: e.target.value,
                          },
                        })
                      }
                      placeholder={field.placeholder}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!!error}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isEnabled = profile.enabled !== false;
  const label = PROVIDER_LABELS[profile.type] ?? profile.type;

  return (
    <Card
      className={cn(
        'flex items-center justify-between gap-3 p-4',
        !isEnabled && 'opacity-50'
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold truncate">
            {profile.displayName || profile.id}
          </span>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {label}
          </Badge>
          {!isEnabled && (
            <Badge variant="outline" className="shrink-0 text-xs">
              Disabled
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          ID: {profile.id} &middot; Priority: {profile.priority ?? 0}
        </span>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={onEdit}>
          Edit
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          Delete
        </Button>
      </div>
    </Card>
  );
}

export function CopilotProfilesEditor({
  profiles,
  onChange,
}: {
  profiles: Profile[];
  onChange: (profiles: Profile[]) => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [form, setForm] = useState<ProfileFormData>(newProfileForm());

  const existingIds = useMemo(() => {
    const ids = new Set(profiles.map(p => p.id));
    // When editing, exclude the current profile's original id
    if (editingIndex !== null && profiles[editingIndex]) {
      ids.delete(profiles[editingIndex].id);
    }
    return ids;
  }, [profiles, editingIndex]);

  const handleAdd = useCallback(() => {
    setEditingIndex(null);
    setForm(newProfileForm());
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback(
    (index: number) => {
      setEditingIndex(index);
      setForm(profileToForm(profiles[index]));
      setDialogOpen(true);
    },
    [profiles]
  );

  const handleDelete = useCallback(
    (index: number) => {
      onChange(profiles.filter((_, i) => i !== index));
    },
    [profiles, onChange]
  );

  const handleSave = useCallback(() => {
    const profile = formToProfile(form);
    if (editingIndex !== null) {
      const next = [...profiles];
      next[editingIndex] = profile;
      onChange(next);
    } else {
      onChange([...profiles, profile]);
    }
    setDialogOpen(false);
  }, [form, editingIndex, profiles, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold leading-6 text-foreground">
          Provider Profiles
        </div>
        <Button size="sm" onClick={handleAdd}>
          Add Profile
        </Button>
      </div>

      {profiles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No provider profiles configured. Add a profile to enable AI features.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {profiles.map((profile, index) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onEdit={() => handleEdit(index)}
              onDelete={() => handleDelete(index)}
            />
          ))}
        </div>
      )}

      <ProfileDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingIndex !== null ? 'Edit Profile' : 'Add Profile'}
        form={form}
        onFormChange={setForm}
        onSave={handleSave}
        existingIds={existingIds}
      />
    </div>
  );
}
