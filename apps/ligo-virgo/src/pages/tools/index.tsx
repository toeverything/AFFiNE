import { Route, Routes } from 'react-router-dom';

import { Container } from './container';
import { Icons } from './icons';

export function Tools() {
    return (
        <Routes>
            <Route path="/" element={<Container />}>
                <Route path="/icons" element={<Icons />} />
            </Route>
        </Routes>
    );
}
