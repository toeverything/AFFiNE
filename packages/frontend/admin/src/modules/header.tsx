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
    <div>
      <div className="flex items-center px-6 gap-4 h-[56px]">
        {isSmallScreen ? (
          <div className="h-7 w-7 p-1" />
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 p-1 hover:bg-gray-200 cursor-pointer"
            onClick={togglePanel}
          >
            <SidebarIcon width={20} height={20} />
          </Button>
        )}
        <Separator orientation="vertical" className="h-5" />
        <div className="text-[15px] font-semibold">{title}</div>
        {endFix && <div className="ml-auto">{endFix}</div>}
      </div>
      <Separator />
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
    <div>
      <div className=" flex justify-between items-center h-[56px] px-6">
        <Button
          type="button"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={handleClose}
        >
          <XIcon size={20} />
        </Button>
        <span className="text-base font-medium">{title}</span>
        <Button
          type="submit"
          size="icon"
          className="w-7 h-7"
          variant="ghost"
          onClick={handleConfirm}
          disabled={!canSave}
        >
          <CheckIcon size={20} />
        </Button>
      </div>
      <Separator />
    </div>
  );
};
