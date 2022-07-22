/* eslint-disable max-lines */
import * as React from 'react';
import { Renderer } from '@tldraw/core';
import { styled } from '@toeverything/components/ui';
import {
    TDDocument,
    TDStatus,
    GRID_SIZE,
    TDMeta,
} from '@toeverything/components/board-types';
import {
    TldrawApp,
    TldrawAppCtorProps,
    TLDR,
} from '@toeverything/components/board-state';
import {
    TldrawContext,
    useStylesheet,
    useKeyboardShortcuts,
    useTldrawApp,
} from './hooks';
import { shapeUtils } from '@toeverything/components/board-shapes';
import { ToolsPanel } from './components/tools-panel';
// import { TopPanel } from '~components/TopPanel';
import { ContextMenu } from './components/context-menu';
// import { FocusButton } from '~components/FocusButton';
import { Loading } from './components/loading';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorFallback } from './components/error-fallback';
import { ZoomBar } from './components/zoom-bar';
import { CommandPanel } from './components/command-panel';

export interface TldrawProps extends TldrawAppCtorProps {
    /**
     * (optional) If provided, the component will load / persist state under this key.
     */
    id?: string;

    /**
     * (optional) The document to load or update from.
     */
    document?: TDDocument;

    /**
     * (optional) The current page id.
     */
    currentPageId?: string;

    /**
     * (optional) Whether the editor should immediately receive focus. Defaults to true.
     */
    autofocus?: boolean;

    /**
     * (optional) Whether to show the menu UI.
     */
    showMenu?: boolean;

    /**
     * (optional) Whether to show the multiplayer menu.
     */
    showMultiplayerMenu?: boolean;
    /**
     * (optional) Whether to show the pages UI.
     */
    showPages?: boolean;

    /**
     * (optional) Whether to show the styles UI.
     */
    showStyles?: boolean;

    /**
     * (optional) Whether to show the zoom UI.
     */
    showZoom?: boolean;

    /**
     * (optional) Whether to show the tools UI.
     */
    showTools?: boolean;

    /**
     * (optional) Whether to show a sponsor link for Tldraw.
     */
    showSponsorLink?: boolean;

    /**
     * (optional) Whether to show the UI.
     */
    showUI?: boolean;

    /**
     * (optional) Whether to the document should be read only.
     */
    readOnly?: boolean;

    /**
     * (optional) Whether to to show the app's dark mode UI.
     */
    darkMode?: boolean;

    /**
     * (optional) If provided, image/video componnets will be disabled.
     *
     * Warning: Keeping this enabled for multiplayer applications without provifing a storage
     * bucket based solution will cause massive base64 string to be written to the liveblocks room.
     */
    disableAssets?: boolean;
}

export function Tldraw({
    id,
    document,
    currentPageId,
    autofocus = true,
    showMenu = true,
    showMultiplayerMenu = true,
    showPages = true,
    showTools = true,
    showZoom = true,
    showStyles = true,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    showUI = true,
    readOnly = false,
    disableAssets = false,
    darkMode = false,
    showSponsorLink,
    callbacks,
    commands,
    getSession,
    tools,
}: TldrawProps) {
    const [sId, set_sid] = React.useState(id);

    // Create a new app when the component mounts.
    const [app, setApp] = React.useState(() => {
        const app = new TldrawApp({
            id,
            callbacks,
            commands,
            getSession,
            tools,
        });
        return app;
    });

    // Create a new app if the `id` prop changes.
    React.useLayoutEffect(() => {
        if (id === sId) return;
        const newApp = new TldrawApp({
            id,
            callbacks,
            commands,
            getSession,
            tools,
        });

        set_sid(id);

        setApp(newApp);
    }, [sId, id]);

    // Update the document if the `document` prop changes but the ids,
    // are the same, or else load a new document if the ids are different.
    React.useEffect(() => {
        if (!document) return;

        if (document.id === app.document.id) {
            app.updateDocument(document);
        } else {
            app.loadDocument(document);
        }
    }, [document, app]);

    // Disable assets when the `disableAssets` prop changes.
    React.useEffect(() => {
        app.setDisableAssets(disableAssets);
    }, [app, disableAssets]);

    // Change the page when the `currentPageId` prop changes.
    React.useEffect(() => {
        if (!currentPageId) return;
        app.changePage(currentPageId);
    }, [currentPageId, app]);

    // Toggle the app's readOnly mode when the `readOnly` prop changes.
    React.useEffect(() => {
        app.readOnly = readOnly;
    }, [app, readOnly]);

    // Toggle the app's darkMode when the `darkMode` prop changes.
    React.useEffect(() => {
        if (darkMode !== app.settings.isDarkMode) {
            app.toggleDarkMode();
        }
    }, [app, darkMode]);

    // Update the app's callbacks when any callback changes.
    React.useEffect(() => {
        app.callbacks = callbacks || {};
    }, [app, callbacks]);

    React.useLayoutEffect(() => {
        if (typeof window === 'undefined') return;
        if (!window.document?.fonts) return;

        function refreshBoundingBoxes() {
            app.refreshBoundingBoxes();
        }
        window.document.fonts.addEventListener(
            'loadingdone',
            refreshBoundingBoxes
        );
        return () => {
            window.document.fonts.removeEventListener(
                'loadingdone',
                refreshBoundingBoxes
            );
        };
    }, [app]);

    // Use the `key` to ensure that new selector hooks are made when the id changes
    return (
        <TldrawContext.Provider value={app}>
            <InnerTldraw
                key={sId || 'Tldraw'}
                id={sId}
                autofocus={autofocus}
                showPages={showPages}
                showMenu={showMenu}
                showMultiplayerMenu={showMultiplayerMenu}
                showStyles={showStyles}
                showZoom={showZoom}
                showTools={showTools}
                showUI={showUI}
                showSponsorLink={showSponsorLink}
                readOnly={readOnly}
            />
        </TldrawContext.Provider>
    );
}

interface InnerTldrawProps {
    id?: string;
    autofocus: boolean;
    readOnly: boolean;
    showPages: boolean;
    showMenu: boolean;
    showMultiplayerMenu: boolean;
    showZoom: boolean;
    showStyles: boolean;
    showUI: boolean;
    showTools: boolean;
    showSponsorLink?: boolean;
}

const InnerTldraw = React.memo(function InnerTldraw({
    id,
    autofocus,
    showPages,
    showMenu,
    showMultiplayerMenu,
    showZoom,
    showStyles,
    showTools,
    showSponsorLink,
    readOnly,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    showUI,
}: InnerTldrawProps) {
    const app = useTldrawApp();

    const rWrapper = React.useRef<HTMLDivElement>(null);

    const state = app.useStore();

    const { document, settings, appState, room } = state;
    const isSelecting = state.appState.activeTool === 'select';

    const page = document.pages[appState.currentPageId];
    const pageState = document.pageStates[page.id];
    const assets = document.assets;
    const { selectedIds } = pageState;

    const isHideBoundsShape =
        selectedIds.length === 1 &&
        page.shapes[selectedIds[0]] &&
        TLDR.get_shape_util(page.shapes[selectedIds[0]].type).hideBounds;

    const isHideResizeHandlesShape =
        selectedIds.length === 1 &&
        page.shapes[selectedIds[0]] &&
        TLDR.get_shape_util(page.shapes[selectedIds[0]].type).hideResizeHandles;

    // Custom rendering meta, with dark mode for shapes
    const meta: TDMeta = React.useMemo(() => {
        return { isDarkMode: settings.isDarkMode, app };
    }, [settings.isDarkMode, app]);

    const showDashedBrush = settings.isCadSelectMode
        ? !appState.selectByContain
        : appState.selectByContain;

    // Custom theme, based on darkmode
    const theme = React.useMemo(() => {
        const { selectByContain } = appState;
        const { isDarkMode, isCadSelectMode } = settings;

        if (isDarkMode) {
            const brushBase = isCadSelectMode
                ? selectByContain
                    ? '69, 155, 255'
                    : '105, 209, 73'
                : '180, 180, 180';
            return {
                brushFill: `rgba(${brushBase}, ${
                    isCadSelectMode ? 0.08 : 0.05
                })`,
                brushStroke: `rgba(${brushBase}, ${
                    isCadSelectMode ? 0.5 : 0.25
                })`,
                brushDashStroke: `rgba(${brushBase}, .6)`,
                selected: 'rgba(38, 150, 255, 1.000)',
                selectFill: 'rgba(38, 150, 255, 0.05)',
                background: '#212529',
                foreground: '#49555f',
            };
        }

        const brushBase = isCadSelectMode
            ? selectByContain
                ? '0, 89, 242'
                : '51, 163, 23'
            : '0,0,0';

        return {
            brushFill: `rgba(${brushBase}, ${isCadSelectMode ? 0.08 : 0.05})`,
            brushStroke: `rgba(${brushBase}, ${isCadSelectMode ? 0.4 : 0.25})`,
            brushDashStroke: `rgba(${brushBase}, .6)`,
            background: '#fff',
        };
    }, [
        settings.isDarkMode,
        settings.isCadSelectMode,
        appState.selectByContain,
    ]);

    const isInSession = app.session !== undefined;

    // Hide bounds when not using the select tool, or when the only selected shape has handles
    const hideBounds =
        (isInSession && app.session?.constructor.name !== 'BrushSession') ||
        !isSelecting ||
        isHideBoundsShape ||
        !!pageState.editingId;

    // Hide bounds when not using the select tool, or when in session
    const hideHandles = isInSession || !isSelecting;

    // Hide indicators when not using the select tool, or when in session
    const hideIndicators =
        (isInSession && state.appState.status !== TDStatus.Brushing) ||
        !isSelecting;

    const hideCloneHandles =
        isInSession ||
        !isSelecting ||
        !settings.showCloneHandles ||
        pageState.camera.zoom < 0.2;
    return (
        <StyledLayout
            ref={rWrapper}
            tabIndex={-0}
            penColor={app?.appState?.currentStyle?.stroke}
        >
            <Loading />
            <OneOff focusableRef={rWrapper} autofocus={autofocus} />
            <ContextMenu>
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                    <Renderer
                        id={id}
                        containerRef={rWrapper}
                        shapeUtils={shapeUtils}
                        page={page}
                        pageState={pageState}
                        assets={assets}
                        snapLines={appState.snapLines}
                        eraseLine={appState.laserLine}
                        grid={GRID_SIZE}
                        users={room?.users}
                        userId={room?.userId}
                        theme={theme}
                        meta={meta as unknown as Record<string, unknown>}
                        hideBounds={hideBounds}
                        hideHandles={hideHandles}
                        hideResizeHandles={isHideResizeHandlesShape}
                        hideIndicators={hideIndicators}
                        hideBindingHandles={!settings.showBindingHandles}
                        hideCloneHandles={hideCloneHandles}
                        hideRotateHandles={!settings.showRotateHandles}
                        hideGrid={!settings.showGrid}
                        showDashedBrush={showDashedBrush}
                        performanceMode={app.session?.performanceMode}
                        onPinchStart={app.onPinchStart}
                        onPinchEnd={app.onPinchEnd}
                        onPinch={app.onPinch}
                        onPan={app.onPan}
                        onZoom={app.onZoom}
                        onPointerDown={app.onPointerDown}
                        onPointerMove={app.onPointerMove}
                        onPointerUp={app.onPointerUp}
                        onPointCanvas={app.onPointCanvas}
                        onDoubleClickCanvas={app.onDoubleClickCanvas}
                        onRightPointCanvas={app.onRightPointCanvas}
                        onDragCanvas={app.onDragCanvas}
                        onReleaseCanvas={app.onReleaseCanvas}
                        onPointShape={app.onPointShape}
                        onDoubleClickShape={app.onDoubleClickShape}
                        onRightPointShape={app.onRightPointShape}
                        onDragShape={app.onDragShape}
                        onHoverShape={app.onHoverShape}
                        onUnhoverShape={app.onUnhoverShape}
                        onReleaseShape={app.onReleaseShape}
                        onPointBounds={app.onPointBounds}
                        onDoubleClickBounds={app.onDoubleClickBounds}
                        onRightPointBounds={app.onRightPointBounds}
                        onDragBounds={app.onDragBounds}
                        onHoverBounds={app.onHoverBounds}
                        onUnhoverBounds={app.onUnhoverBounds}
                        onReleaseBounds={app.onReleaseBounds}
                        onPointBoundsHandle={app.onPointBoundsHandle}
                        onDoubleClickBoundsHandle={
                            app.onDoubleClickBoundsHandle
                        }
                        onRightPointBoundsHandle={app.onRightPointBoundsHandle}
                        onDragBoundsHandle={app.onDragBoundsHandle}
                        onHoverBoundsHandle={app.onHoverBoundsHandle}
                        onUnhoverBoundsHandle={app.onUnhoverBoundsHandle}
                        onReleaseBoundsHandle={app.onReleaseBoundsHandle}
                        onPointHandle={app.onPointHandle}
                        onDoubleClickHandle={app.onDoubleClickHandle}
                        onRightPointHandle={app.onRightPointHandle}
                        onDragHandle={app.onDragHandle}
                        onHoverHandle={app.onHoverHandle}
                        onUnhoverHandle={app.onUnhoverHandle}
                        onReleaseHandle={app.onReleaseHandle}
                        onError={app.onError}
                        onRenderCountChange={app.onRenderCountChange}
                        onShapeChange={app.onShapeChange}
                        onShapeBlur={app.onShapeBlur}
                        onShapeClone={app.onShapeClone}
                        onBoundsChange={app.updateBounds}
                        onKeyDown={app.onKeyDown}
                        onKeyUp={app.onKeyUp}
                        onDragOver={app.onDragOver}
                        onDrop={app.onDrop}
                    />
                </ErrorBoundary>
            </ContextMenu>
            {showUI && (
                <StyledUI>
                    <>
                        <StyledSpacer />
                        {showTools && !readOnly && <ToolsPanel app={app} />}
                        <CommandPanel app={app} />
                    </>
                </StyledUI>
            )}
            <ZoomBar />
        </StyledLayout>
    );
});

const OneOff = React.memo(function OneOff({
    focusableRef,
    autofocus,
}: {
    autofocus?: boolean;
    focusableRef: React.RefObject<HTMLDivElement>;
}) {
    useKeyboardShortcuts(focusableRef);
    useStylesheet();

    React.useEffect(() => {
        if (autofocus) {
            focusableRef.current?.focus();
        }
    }, [autofocus]);

    return null;
});

const StyledLayout = styled('div')<{ penColor: string }>(
    ({ theme, penColor }) => {
        return {
            position: 'relative',
            height: '100%',
            width: '100vw',
            minHeight: 0,
            minWidth: 0,
            maxHeight: '100%',
            maxWidth: '100%',
            overflow: 'hidden',
            boxSizing: 'border-box',
            outline: 'none',

            '& .tl-container': {
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: '100%',
                zIndex: 1,
                '.tl-erase-line': {
                    fill: penColor,
                },
            },

            '& input, textarea, button, select, label, button': {
                webkitTouchCallout: 'none',
                webkitUserSelect: 'none',
                WebkitTapHighlightColor: 'transparent',
                tapHighlightColor: 'transparent',
            },
        };
    }
);

// eslint-disable-next-line @typescript-eslint/naming-convention
const StyledUI = styled('div')({
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    width: '100%',
    padding: '8px 8px 0 8px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    pointerEvents: 'none',
    zIndex: 2,
    '& > *': {
        pointerEvents: 'all',
    },
});

const StyledSpacer = styled('div')({
    flexGrow: 2,
});
