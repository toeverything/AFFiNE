import { getTitle, getBoard } from '../support/app.po';

describe('ligo-virgo', () => {
    beforeEach(() => cy.visit('/'));

    it('basic load check', () => {
        getTitle().contains('Get Started with AFFiNE');

        cy.get('.block_container').contains('The Essentials');

        getBoard().click();
        cy.get('.tl-inner-div').contains('Graduating');
    });
});
