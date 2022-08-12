import { Route, Routes } from 'react-router-dom';

import Calendar from './calendar';
import Container from './container';
import Home from './home';
import Tasks from './tasks';
import Today from './today';

export default function AgendaContainer() {
    return (
        <Routes>
            <Route path="/" element={<Container />}>
                <Route path="/calendar" element={<Calendar />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/today" element={<Today />} />
                <Route path="/" element={<Home />} />
            </Route>
        </Routes>
    );
}
