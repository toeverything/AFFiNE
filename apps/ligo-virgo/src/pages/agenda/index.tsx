import { Routes, Route } from 'react-router-dom';

import Container from './container';
import Calendar from './calendar';
import Tasks from './tasks';
import Today from './today';
import Home from './home';

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
