import { SidebarIcon } from '@blocksuite/icons/rc';
import { CheckIcon, XIcon } from 'lucide-react';

import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import { useMediaQuery } from './common';
import { useLeftPanel } from './panel/context';

export const Header = ({
  title,
  endFix,
}: {
  title: string;
  endFix?: React.ReactNode;
}) => {
  const { togglePanel } = useLeftPanel();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  return (
    <div className="border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="flex h-14 items-center gap-4 px-6">
        {isSmallScreen ? (
          <div className="h-7 w-7 p-1" />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 cursor-pointer p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={togglePanel}
          >
            <SidebarIcon width={20} height={20} />
          </Button>
        )}
        <Separator orientation="vertical" className="h-5" />
        <div className="text-sm font-semibold tracking-tight">{title}</div>
        {endFix && <div className="ml-auto">{endFix}</div>}
      </div>
    </div>
  );
};

export const RightPanelHeader = ({
  title,
  handleClose,
  handleConfirm,
  canSave,
}: {
  title: string;
  handleClose: () => void;
  handleConfirm: () => void;
  canSave: boolean;
}) => {
  return (
    <div className="border-b border-border/60 bg-card/80 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-4">
        <Button
          type="button"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          variant="ghost"
          onClick={handleClose}
        >
          <XIcon size={18} />
        </Button>
        <span className="text-sm font-semibold tracking-tight">{title}</span>
        <Button
          type="submit"
          size="icon"
          className="h-7 w-7 text-primary hover:text-primary"
          variant="ghost"
          onClick={handleConfirm}
          disabled={!canSave}
        >
          <CheckIcon size={18} />
        </Button>
      </div>
    </div>
  );
};
