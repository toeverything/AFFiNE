import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@affine/admin/components/ui/resizable';
import { Separator } from '@affine/admin/components/ui/separator';
import { TooltipProvider } from '@affine/admin/components/ui/tooltip';
import { cn } from '@affine/admin/utils';
import {
  AlignJustifyIcon,
  ClipboardList,
  Cpu,
  Settings,
  Users,
} from 'lucide-react';
import type { ReactNode, RefObject } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

import { Button } from '../components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../components/ui/sheet';
import { Logo } from './accounts/components/logo';
import type { NavProp } from './nav/nav';
import { Nav } from './nav/nav';

interface LayoutProps {
  content: ReactNode;
}

interface RightPanelContextType {
  isOpen: boolean;
  rightPanelContent: ReactNode;
  setRightPanelContent: (content: ReactNode) => void;
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
}
const RightPanelContext = createContext<RightPanelContextType | undefined>(
  undefined
);

const navLinks: NavProp[] = [
  {
    title: 'Accounts',
    icon: Users,
    to: '/admin/accounts',
  },
  {
    title: 'AI',
    icon: Cpu,
    to: '/admin/ai',
  },
  {
    title: 'Config',
    icon: ClipboardList,
    to: '/admin/config',
  },
  {
    title: 'Settings',
    icon: Settings,
    to: '/admin/settings',
  },
];

export const useRightPanel = () => {
  const context = useContext(RightPanelContext);

  if (!context) {
    throw new Error('useRightPanel must be used within a RightPanelProvider');
  }

  return context;
};

export function useMediaQuery(query: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    function onChange(event: MediaQueryListEvent) {
      setValue(event.matches);
    }

    const result = matchMedia(query);
    result.addEventListener('change', onChange);
    setValue(result.matches);

    return () => result.removeEventListener('change', onChange);
  }, [query]);

  return value;
}

export function Layout({ content }: LayoutProps) {
  const [rightPanelContent, setRightPanelContent] = useState<ReactNode>(null);
  const [open, setOpen] = useState(false);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);

  const handleExpand = useCallback(() => {
    if (rightPanelRef.current?.getSize() === 0) {
      rightPanelRef.current?.resize(30);
    }
    setOpen(true);
  }, [rightPanelRef]);

  const handleCollapse = useCallback(() => {
    if (rightPanelRef.current?.getSize() !== 0) {
      rightPanelRef.current?.resize(0);
    }
    setOpen(false);
  }, [rightPanelRef]);

  const openPanel = useCallback(() => {
    handleExpand();
    rightPanelRef.current?.expand();
  }, [handleExpand]);

  const closePanel = useCallback(() => {
    handleCollapse();
    rightPanelRef.current?.collapse();
  }, [handleCollapse]);

  const togglePanel = useCallback(
    () => (rightPanelRef.current?.isCollapsed() ? openPanel() : closePanel()),
    [closePanel, openPanel]
  );

  const activeTab = useMemo(() => {
    const path = window.location.pathname;

    return (
      navLinks.find(link => path.endsWith(link.title.toLocaleLowerCase()))
        ?.title || ''
    );
  }, []);

  return (
    <RightPanelContext.Provider
      value={{
        isOpen: open,
        rightPanelContent,
        setRightPanelContent,
        togglePanel,
        openPanel,
        closePanel,
      }}
    >
      <TooltipProvider delayDuration={0}>
        <div className="flex">
          <LeftPanel activeTab={activeTab} />
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel id="0" order={0} minSize={50}>
              {content}
            </ResizablePanel>
            <RightPanel
              rightPanelRef={rightPanelRef}
              onExpand={handleExpand}
              onCollapse={handleCollapse}
            />
          </ResizablePanelGroup>
        </div>
      </TooltipProvider>
    </RightPanelContext.Provider>
  );
}

export const LeftPanel = ({ activeTab }: { activeTab: string }) => {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');

  if (isSmallScreen) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className="fixed  top-[14px] left-6 p-0 h-5 w-5"
          >
            <AlignJustifyIcon />
          </Button>
        </SheetTrigger>
        <SheetHeader className="hidden">
          <SheetTitle>AFFiNE</SheetTitle>
          <SheetDescription>
            Admin panel for managing accounts, AI, config, and settings
          </SheetDescription>
        </SheetHeader>
        <SheetContent side="left" className="p-0" withoutCloseButton>
          <div className="flex flex-col w-full h-full">
            <div
              className={cn(
                'flex h-[52px] items-center gap-2 px-4 text-base font-medium'
              )}
            >
              <Logo />
              AFFiNE
            </div>
            <Separator />
            <Nav links={navLinks} activeTab={activeTab} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div className="flex flex-col min-w-52 max-w-sm border-r">
      <div
        className={cn(
          'flex h-[52px] items-center gap-2 px-4 text-base font-medium'
        )}
      >
        <Logo />
        AFFiNE
      </div>
      <Separator />
      <Nav links={navLinks} activeTab={activeTab} />
    </div>
  );
};
export const RightPanel = ({
  rightPanelRef,
  onExpand,
  onCollapse,
}: {
  rightPanelRef: RefObject<ImperativePanelHandle>;
  onExpand: () => void;
  onCollapse: () => void;
}) => {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { rightPanelContent, isOpen } = useRightPanel();
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) {
        onExpand();
      } else {
        onCollapse();
      }
    },
    [onExpand, onCollapse]
  );

  if (isSmallScreen) {
    return (
      <Sheet open={isOpen} onOpenChange={onOpenChange}>
        <SheetHeader className="hidden">
          <SheetTitle>Right Panel</SheetTitle>
          <SheetDescription>
            For displaying additional information
          </SheetDescription>
        </SheetHeader>
        <SheetContent side="right" className="p-0" withoutCloseButton>
          {rightPanelContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <>
      <ResizableHandle />
      <ResizablePanel
        id="1"
        order={1}
        ref={rightPanelRef}
        defaultSize={0}
        maxSize={30}
        collapsible={true}
        collapsedSize={0}
        onExpand={onExpand}
        onCollapse={onCollapse}
      >
        {rightPanelContent}
      </ResizablePanel>
    </>
  );
};
