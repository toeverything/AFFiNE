# `@blocksuite/integration-test`

Integration test for BlockSuite.

## Running Tests

You can run all integration tests using:

```bash
cd blocksuite/integration-test
yarn test:unit
```

To run a specific test or test file, use the `-t` flag with a test name pattern:

```bash
# Run a specific test
yarn test:unit -t "should access turbo renderer instance"

# Run all tests in a specific file
yarn test:unit src/__tests__/edgeless/viewport-renderer.spec.ts
```

For debugging tests with the Playwright debugger:

```bash
yarn test:debug

yarn test:debug -t "should access turbo renderer instance"
```
