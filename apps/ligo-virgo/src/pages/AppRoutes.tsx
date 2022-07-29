import { Routes, Route, Navigate } from 'react-router-dom';

import Agenda from './agenda';
import { WorkspaceContainer } from './workspace';
import Recent from './recent';
import Search from './search';
import Settings from './settings';
import Shared from './shared';
import Starred from './starred';
import { Login } from './account';
import { PageNotFound } from './status/page-not-found';
import { WorkspaceNotFound } from './status/workspace-not-found';
import { RoutePrivate } from './RoutePrivate';
import { RoutePublicAutoLogin } from './RoutePublicAutoLogin';
import { Tools } from './tools';
import { LigoVirgoRootContainer } from './AppContainer';
import { UIPage } from './ui';

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
