import { Outlet, Route, Routes } from 'react-router-dom';

import { Container } from '@mui/joy';
import { CssVarsProvider } from '@mui/joy/styles';

import { AboutUs } from './AboutUs';
import { App } from './App';

const VenusContainer = () => {
    return (
        <CssVarsProvider>
            <Container
                fixed
                sx={{
                    margin: '1em auto',
                    maxWidth: '1440px !important',
                    '&>div': {
                        marginTop: '1em',
                    },
                }}
            >
                <Outlet />
            </Container>
        </CssVarsProvider>
    );
};

export function VenusRoutes() {
    return (
        <Routes>
            <Route element={<VenusContainer />}>
                <Route path="/aboutus" element={<AboutUs />} />
                <Route path="/" element={<App />} />
            </Route>
        </Routes>
    );
}
