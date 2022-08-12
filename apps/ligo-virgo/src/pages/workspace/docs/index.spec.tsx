import { render } from '@testing-library/react';

import { Page } from './index';

describe('App', () => {
    it('should render successfully', () => {
        const { baseElement } = render(<Page workspace="default" />);

        expect(baseElement).toBeTruthy();
    });

    it('should have a greeting as the title', () => {
        const { getByText } = render(<Page workspace="default" />);

        expect(getByText(/Welcome ligo-virgo/gi)).toBeTruthy();
    });
});
