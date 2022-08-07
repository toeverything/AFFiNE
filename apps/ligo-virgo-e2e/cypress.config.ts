import { defineConfig } from 'cypress';

module.exports = defineConfig({
    e2e: {
        supportFile: './src/support/index.ts',
        specPattern: './src/integration',
        setupNodeEvents(on, config) {
            // implement node event listeners here
        },
    },
    fileServerFolder: '.',
    fixturesFolder: './src/fixtures',
    video: false,
    // videosFolder: '../../dist/cypress/apps/ligo-virgo-e2e/videos',
    screenshotsFolder: '../../dist/cypress/apps/ligo-virgo-e2e/screenshots',
    chromeWebSecurity: false,
});
