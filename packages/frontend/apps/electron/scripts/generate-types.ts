import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Project } from 'ts-morph';

import { parseIpcEvents } from './ipc-generator/events-parser';
import { parseIpcHandlers } from './ipc-generator/handlers-parser';
import {
  type CollectedApisMap,
  type CollectedEventsMap,
  type OutputPaths,
} from './ipc-generator/types';
import {
  generateApiTypesFile,
  generateCombinedMetaFile,
  generateEventTypesFile,
} from './ipc-generator/utils';

// ES module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const electronRoot = path.resolve(__dirname, '../');
const rootDir = path.resolve(electronRoot, '..', '..', '..', '..');

// Configure output paths
const paths: OutputPaths = {
  // Generate api types under @affine/electron-api
  apiTypes: path.resolve(
    rootDir,
    'packages/frontend/electron-api/src/ipc-api-types.gen.ts'
  ),
  ipcMeta: path.resolve(electronRoot, 'src/entries/preload/ipc-meta.gen.ts'),
  // Event type definitions
  eventTypes: path.resolve(
    rootDir,
    'packages/frontend/electron-api/src/ipc-event-types.gen.ts'
  ),
};

function ensureDirectories(paths: OutputPaths): void {
  Object.values(paths)
    .filter(Boolean) // Skip empty paths
    .forEach(filePath => {
      try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
      } catch (e: any) {
        // Only warn about errors other than "directory already exists"
        if (e.code !== 'EEXIST') {
          console.warn(`[WARN] Could not create directory: ${e.message}`);
          throw new Error(
            `Failed to create directory for ${filePath}: ${e.message}`
          );
        }
      }
    });
}

function writeGeneratedFiles(
  collectedApiHandlers: CollectedApisMap,
  collectedEvents: CollectedEventsMap,
  paths: OutputPaths
): void {
  // Write API handler types file
  fs.writeFileSync(paths.apiTypes, generateApiTypesFile(collectedApiHandlers));
  console.log(`IPC API type definitions generated at: ${paths.apiTypes}`);

  // Write event types file if events were found
  if (collectedEvents.size > 0) {
    fs.writeFileSync(paths.eventTypes, generateEventTypesFile(collectedEvents));
    console.log(`IPC Event type definitions generated at: ${paths.eventTypes}`);
  } else {
    console.log('No IPC Events found. Skipping event types generation.');
  }

  // Write combined metadata file
  fs.writeFileSync(
    paths.ipcMeta,
    generateCombinedMetaFile(collectedApiHandlers, collectedEvents)
  );
  console.log(`IPC combined metadata generated at: ${paths.ipcMeta}`);
}

/**
 * Main function to generate IPC definitions
 */
function generateIpcDefinitions() {
  // Initialize ts-morph project
  const project = new Project({
    tsConfigFilePath: path.resolve(electronRoot, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: true,
  });

  // Add relevant source files
  project.addSourceFilesAtPaths([
    path.resolve(electronRoot, 'src/**/*.ts'),
    // Add other paths where IPC handlers might be defined
  ]);

  // Parse handlers and events from the source files
  const { apis: collectedApiHandlers } = parseIpcHandlers(project);

  const { events: collectedEvents } = parseIpcEvents(project);

  if (collectedApiHandlers.size === 0) {
    console.log(
      'No IPC handlers found. Generated files will be empty or contain minimal structure.'
    );
  }

  // Ensure directories exist
  ensureDirectories(paths);

  // Write generated files
  writeGeneratedFiles(collectedApiHandlers, collectedEvents, paths);
}

// Run the generator
generateIpcDefinitions();
