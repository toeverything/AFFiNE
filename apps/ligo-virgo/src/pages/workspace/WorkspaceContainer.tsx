import { useUserAndSpaces } from '@toeverything/datasource/state';
import { Route, Routes, useParams } from 'react-router';
import { WorkspaceRootContainer } from './Container';
import { Page } from './docs';
import { Edgeless } from './Edgeless';
import { WorkspaceHome } from './Home';
import Pages from './pages';

export function WorkspaceContainer() {
    const { workspaceId } = useParams();
    const { user, currentSpaceId } = useUserAndSpaces();

    return (
        <Routes>
            <Route path="/" element={<WorkspaceRootContainer />}>
                <Route path="/pages" element={<Pages />} />
                <Route
                    path="/:page_id/edgeless"
                    element={<Edgeless workspace={workspaceId} />}
                />
                <Route
                    path="/:page_id"
                    element={<Page workspace={workspaceId} />}
                />
                <Route path="/" element={<WorkspaceHome />} />
            </Route>
        </Routes>
    );
}
