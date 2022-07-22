import { FC } from 'react';
import {
    MuiIconButton as IconButton,
    MuiButton as Button,
    styled,
} from '@toeverything/components/ui';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';

import { useTldrawApp } from '../../hooks';
import { TDSnapshot } from '@toeverything/components/board-types';

import { MiniMap } from './mini-map';

const zoomSelector = (s: TDSnapshot) =>
    s.document.pageStates[s.appState.currentPageId].camera.zoom;

export const ZoomBar: FC = () => {
    const app = useTldrawApp();
    const zoom = app.useStore(zoomSelector);

    return (
        <div
            style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 200 }}
        >
            <MiniMapContainer>
                <MiniMap />
            </MiniMapContainer>

            <div
                style={{
                    padding: '0 10px',
                    background: '#ffffff',
                    borderRadius: '8px',
                }}
            >
                <Button
                    variant="text"
                    style={{ color: 'rgba(0,0,0,0.5)' }}
                    onClick={app.resetZoom}
                >
                    {Math.round(zoom * 100)}%
                </Button>
                <IconButton onClick={app.zoomOut}>
                    <RemoveIcon />
                </IconButton>
                <IconButton onClick={app.zoomIn}>
                    <AddIcon />
                </IconButton>
                <IconButton onClick={app.zoomToFit}>
                    <UnfoldMoreIcon style={{ transform: 'rotateZ(90deg)' }} />
                </IconButton>
            </div>
        </div>
    );
};

const MiniMapContainer = styled('div')({
    display: 'flex',
    justifyContent: 'flex-end',
});
