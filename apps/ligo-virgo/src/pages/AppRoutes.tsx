import { Navigate, Route, Routes } from 'react-router-dom';

import { Login } from './account';
import { LigoVirgoRootContainer } from './AppContainer';
import { RoutePrivate } from './RoutePrivate';
import { RoutePublicAutoLogin } from './RoutePublicAutoLogin';
import { PageNotFound } from './status/page-not-found';
import { WorkspaceNotFound } from './status/workspace-not-found';
import { Tools } from './tools';
import { UIPage } from './ui';
import { WorkspaceContainer } from './workspace';

export function LigoVirgoRoutes() {
    return (
        <Routes>
            <Route path="/" element={<LigoVirgoRootContainer />}>
                <Route path="/error/404" element={<PageNotFound />} />
                <Route
                    path="/error/workspace"
                    element={<WorkspaceNotFound />}
                />
                <Route path="/ui" element={<UIPage />} />
                <Route
                    path="/:workspaceId/*"
                    element={
                        <RoutePrivate>
                            <WorkspaceContainer />
                        </RoutePrivate>
                    }
                />
                <Route path="/" element={<Navigate to="/login" replace />} />
            </Route>

            {/* put public routes here; header and sidebar are disabled here */}
            <Route>
                <Route path="/tools/*" element={<Tools />} />
                <Route
                    path="/login"
                    element={
                        <RoutePublicAutoLogin>
                            <Login />
                        </RoutePublicAutoLogin>
                    }
                />
                <Route path="/" element={<Navigate to="/login" replace />} />
            </Route>
        </Routes>
    );
}
