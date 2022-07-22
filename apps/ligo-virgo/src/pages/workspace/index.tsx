/* eslint-disable filename-rules/match */
import { Routes, Route, useParams, Navigate } from 'react-router';

import { useUserAndSpaces } from '@toeverything/datasource/state';

import { WorkspaceRootContainer } from './Container';
import { Page } from './docs';
import { WorkspaceHome } from './Home';
import Labels from './labels';
import Pages from './pages';
import { Whiteboard } from './Whiteboard';

export function WorkspaceContainer() {
    const { workspace_id } = useParams();
    const { user, currentSpaceId } = useUserAndSpaces();

    if (
        user &&
        ![currentSpaceId, 'affine2vin277tcmafwq'].includes(workspace_id)
    ) {
        // return <Navigate to={`/${currentSpaceId}`} replace={true} />;
    }

    return (
        <Routes>
            <Route path="/" element={<WorkspaceRootContainer />}>
                <Route path="/labels" element={<Labels />} />
                <Route path="/pages" element={<Pages />} />
                <Route
                    path="/:page_id/whiteboard"
                    element={<Whiteboard workspace={workspace_id} />}
                />
                <Route
                    path="/:page_id"
                    element={<Page workspace={workspace_id} />}
                />
                <Route path="/" element={<WorkspaceHome />} />
            </Route>
        </Routes>
    );
}
