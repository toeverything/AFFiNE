import { Route, Routes, useParams } from 'react-router';

import { useUserAndSpaces } from '@toeverything/datasource/state';

import { WorkspaceRootContainer } from './Container';
import { Page } from './docs';
import { Edgeless } from './Edgeless';
import { WorkspaceHome } from './Home';
import Labels from './labels';
import Pages from './pages';

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
                    path="/:page_id/edgeless"
                    element={<Edgeless workspace={workspace_id} />}
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
