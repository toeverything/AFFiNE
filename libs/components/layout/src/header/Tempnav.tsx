import { useState } from 'react';
import { NavLink } from 'react-router-dom';

import {
    MuiButton as Button,
    MuiMenu as Menu,
    MuiMenuItem as MenuItem,
} from '@toeverything/components/ui';

export function TempLinkRouter() {
    const [anchorEl, setAnchorEl] = useState(null);
    const open = Boolean(anchorEl);

    const handleClose = () => {
        setAnchorEl(null);
    };

    return (
        <div>
            <Button onClick={e => setAnchorEl(e.currentTarget)} sx={{ mr: 4 }}>
                Debug Routers
            </Button>
            <Menu anchorEl={anchorEl} open={open} onClose={handleClose}>
                <MenuItem onClick={handleClose}>
                    <NavLink to="/agenda/calendar">/agenda/calendar</NavLink>
                </MenuItem>
                <MenuItem onClick={handleClose}>
                    <NavLink to="/agenda/tasks">/agenda/tasks</NavLink>
                </MenuItem>
                <MenuItem onClick={handleClose}>
                    <NavLink to="/agenda/today">/agenda/today</NavLink>
                </MenuItem>
                <MenuItem onClick={handleClose}>
                    <NavLink to="/agenda/">/agenda/</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/workspaceId/labels">
                        /workspaceId/labels
                    </NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/workspaceId/pages">
                        /workspaceId/pages
                    </NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/workspaceId/docId">
                        /workspaceId/docId
                    </NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/workspaceId/">/workspaceId/</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/login">/login</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/recent">/recent</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/search">/search</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/settings">/settings</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/shared">/shared</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/started">/started</NavLink>
                </MenuItem>
                <MenuItem>
                    <NavLink to="/">/</NavLink>
                </MenuItem>
            </Menu>
        </div>
    );
}

export default TempLinkRouter;
