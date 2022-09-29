import { useState } from 'react';
import { InfoModal } from './InfoModal';
import { LogoIcon } from './LogoIcon';

export const Logo = () => {
    const [open, setOpen] = useState(false);
    return (
        <>
            <LogoIcon onClick={() => setOpen(true)} />
            <InfoModal open={open} onClose={() => setOpen(false)} />
        </>
    );
};
