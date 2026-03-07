import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { CodeIcon } from '@blocksuite/icons/rc';

interface SourceModeToggleProps {
  isSourceMode: boolean;
  onToggle: () => void;
}

export function SourceModeToggle({
  isSourceMode,
  onToggle,
}: SourceModeToggleProps) {
  const t = useI18n();
  const label = isSourceMode
    ? t['com.affine.header.mode-switch.exit-source']()
    : t['com.affine.header.mode-switch.source']();

  return (
    <IconButton
      size="20"
      tooltip={label}
      aria-pressed={isSourceMode}
      data-testid="source-mode-toggle"
      onClick={onToggle}
    >
      <CodeIcon />
    </IconButton>
  );
}
