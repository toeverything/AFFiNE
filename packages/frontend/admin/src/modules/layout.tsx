import {
  ResizablePanel,
  ResizablePanelGroup,
} from '@affine/admin/components/ui/resizable';
import { Separator } from '@affine/admin/components/ui/separator';
import { TooltipProvider } from '@affine/admin/components/ui/tooltip';
import { cn } from '@affine/admin/utils';
import { cssVarV2 } from '@toeverything/theme/v2';
import { AlignJustifyIcon } from 'lucide-react';
import type { PropsWithChildren, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { useLocation } from 'react-router-dom';

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
import { useMediaQuery } from './common';
import { NavContext } from './nav/context';
import { Nav } from './nav/nav';
import {
  PanelContext,
  type ResizablePanelProps,
  useRightPanel,
} from './panel/context';

export function Layout({ children }: PropsWithChildren) {
  const [rightPanelContent, setRightPanelContentState] =
    useState<ReactNode>(null);
  const [leftPanelContent, setLeftPanelContent] = useState<ReactNode>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightPanelHasDirtyChanges, setRightPanelHasDirtyChanges] =
    useState(false);
  const rightPanelRef = useRef<ImperativePanelHandle>(null);
  const leftPanelRef = useRef<ImperativePanelHandle>(null);
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('');
  const [activeSubTab, setActiveSubTab] = useState('server');
  const [currentModule, setCurrentModule] = useState('server');

  const handleLeftExpand = useCallback(() => {
    if (leftPanelRef.current?.getSize() === 0) {
      leftPanelRef.current?.resize(30);
    }
    setLeftOpen(true);
  }, [leftPanelRef]);

  const handleLeftCollapse = useCallback(() => {
    if (leftPanelRef.current?.getSize() !== 0) {
      leftPanelRef.current?.resize(0);
    }
    setLeftOpen(false);
  }, [leftPanelRef]);

  const openLeftPanel = useCallback(() => {
    handleLeftExpand();
    leftPanelRef.current?.expand();
    setLeftOpen(true);
  }, [handleLeftExpand]);

  const closeLeftPanel = useCallback(() => {
    handleLeftCollapse();
    leftPanelRef.current?.collapse();
    setLeftOpen(false);
  }, [handleLeftCollapse]);

  const toggleLeftPanel = useCallback(
    () =>
      leftPanelRef.current?.isCollapsed() ? openLeftPanel() : closeLeftPanel(),
    [openLeftPanel, closeLeftPanel]
  );

  const handleRightExpand = useCallback(() => {
    if (rightPanelRef.current?.getSize() === 0) {
      rightPanelRef.current?.resize(30);
    }
    setRightOpen(true);
  }, [rightPanelRef]);

  const handleRightCollapse = useCallback(() => {
    if (rightPanelRef.current?.getSize() !== 0) {
      rightPanelRef.current?.resize(0);
    }
    setRightOpen(false);
  }, [rightPanelRef]);

  const handleSetRightPanelContent = useCallback(
    (content: ReactNode) => {
      setRightPanelHasDirtyChanges(false);
      setRightPanelContentState(content);
    },
    [setRightPanelContentState, setRightPanelHasDirtyChanges]
  );

  const openRightPanel = useCallback(() => {
    handleRightExpand();
    rightPanelRef.current?.expand();
    setRightOpen(true);
  }, [handleRightExpand]);

  const closeRightPanel = useCallback(() => {
    handleRightCollapse();
    rightPanelRef.current?.collapse();
    setRightOpen(false);
    setRightPanelHasDirtyChanges(false);
  }, [handleRightCollapse, setRightPanelHasDirtyChanges]);

  const toggleRightPanel = useCallback(
    () =>
      rightPanelRef.current?.isCollapsed()
        ? openRightPanel()
        : closeRightPanel(),
    [closeRightPanel, openRightPanel]
  );

  // auto close right panel when route changes
  useEffect(() => {
    handleSetRightPanelContent(null);
    closeRightPanel();
  }, [location.pathname, closeRightPanel, handleSetRightPanelContent]);

  return (
    <PanelContext.Provider
      value={{
        leftPanel: {
          isOpen: leftOpen,
          panelContent: leftPanelContent,
          setPanelContent: setLeftPanelContent,
          togglePanel: toggleLeftPanel,
          openPanel: openLeftPanel,
          closePanel: closeLeftPanel,
        },
        rightPanel: {
          isOpen: rightOpen,
          panelContent: rightPanelContent,
          setPanelContent: handleSetRightPanelContent,
          togglePanel: toggleRightPanel,
          openPanel: openRightPanel,
          closePanel: closeRightPanel,
          hasDirtyChanges: rightPanelHasDirtyChanges,
          setHasDirtyChanges: setRightPanelHasDirtyChanges,
        },
      }}
    >
      <NavContext.Provider
        value={{
          activeTab,
          activeSubTab,
          currentModule,
          setActiveTab,
          setActiveSubTab,
          setCurrentModule,
        }}
      >
        <TooltipProvider delayDuration={0}>
          <div className="flex h-screen w-full overflow-hidden">
            <ResizablePanelGroup direction="horizontal">
              <LeftPanel
                panelRef={leftPanelRef as RefObject<ImperativePanelHandle>}
                onExpand={handleLeftExpand}
                onCollapse={handleLeftCollapse}
              />
              <ResizablePanel id="1" order={1} minSize={50} defaultSize={50}>
                {children}
              </ResizablePanel>
              <RightPanel
                panelRef={rightPanelRef as RefObject<ImperativePanelHandle>}
                onExpand={handleRightExpand}
                onCollapse={handleRightCollapse}
              />
            </ResizablePanelGroup>
          </div>
        </TooltipProvider>
      </NavContext.Provider>
    </PanelContext.Provider>
  );
}

export const LeftPanel = ({
  panelRef,
  onExpand,
  onCollapse,
}: ResizablePanelProps) => {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const isCollapsed = panelRef.current?.isCollapsed();

  if (isSmallScreen) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" className="fixed  top-5 left-6 p-0 h-5 w-5">
            <AlignJustifyIcon size={20} />
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
            <Nav />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <ResizablePanel
      id="0"
      order={0}
      ref={panelRef}
      defaultSize={15}
      maxSize={15}
      minSize={15}
      collapsible={true}
      collapsedSize={2}
      onExpand={onExpand}
      onCollapse={onCollapse}
      className={cn(
        isCollapsed ? 'min-w-[57px] max-w-[57px]' : 'min-w-56 max-w-56',
        'border-r  h-dvh'
      )}
      style={{ overflow: 'visible' }}
    >
      <div
        className="flex flex-col max-w-56 h-full "
        style={{
          backgroundColor: cssVarV2(
            'selfhost/layer/background/sidebarBg/sidebarBg'
          ),
        }}
      >
        <div
          className={cn(
            'flex h-[56px] items-center px-4 text-base font-medium',
            isCollapsed && 'justify-center px-2'
          )}
        >
          <span
            className={cn(
              'flex items-center p-0.5 mr-2',
              isCollapsed && 'justify-center px-2 mr-0'
            )}
          >
            <Logo />
          </span>
          {!isCollapsed && 'AFFiNE'}
        </div>
        <Nav isCollapsed={isCollapsed} />
      </div>
    </ResizablePanel>
  );
};
export const RightPanel = ({
  panelRef,
  onExpand,
  onCollapse,
}: ResizablePanelProps) => {
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { panelContent, isOpen } = useRightPanel();
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
          <div className="h-full overflow-y-auto">{panelContent}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <ResizablePanel
      id="2"
      order={2}
      ref={panelRef}
      defaultSize={0}
      maxSize={20}
      collapsible={true}
      collapsedSize={0}
      onExpand={onExpand}
      onCollapse={onCollapse}
      className="border-l max-w-96"
    >
      <div className="h-full overflow-y-auto">{panelContent}</div>
    </ResizablePanel>
  );
};
