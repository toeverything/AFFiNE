# AFFiNE Cloud Copilot E2E Tests

This directory contains end-to-end tests for the AFFiNE Cloud Copilot feature. The tests are organized in a structured way to ensure comprehensive coverage of different functionalities.

## Test Structure

The e2e tests are organized into the following categories:

1. **Basic Tests (`/basic`)**: Tests for verifying core AI capabilities including feature onboarding, authorization workflows, and basic chat interactions.
2. **Chat Interaction Tests (`/chat-with`)**: Tests for verifying the AI's interaction with various ​object types, such as attachments, images, text content, Edgeless elements, etc.
3. **AI Action Tests (`/ai-action`)**: Tests for verifying the AI's actions, such as text translation, gramma correction, etc.
4. **Insertion Tests (`/insertion`)**: Tests for verifying answer insertion functionality.

## Test Utilities

The `/utils` directory contains shared utilities for testing:

- **ChatPanelUtils**: Helper functions for chat panel interactions
- **EditorUtils**: Helper functions for editor operations
- **TestUtils**: General test utilities and setup functions
