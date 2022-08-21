import { Navigate, Route, Routes } from 'react-router-dom';

import { Login } from './account';
import Agenda from './agenda';
import { LigoVirgoRootContainer } from './AppContainer';
import Recent from './recent';
import { RoutePrivate } from './RoutePrivate';
import { RoutePublicAutoLogin } from './RoutePublicAutoLogin';
import Search from './search';
import Settings from './settings';
import Shared from './shared';
import Starred from './starred';
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

                <Route path="/agenda/*" element={<Agenda />} />
                <Route path="/recent" element={<Recent />} />
                <Route path="/search" element={<Search />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/shared" element={<Shared />} />
                <Route path="/started" element={<Starred />} />
                <Route path="/ui" element={<UIPage />} />
                <Route
                    path="/:workspace_id/*"
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
