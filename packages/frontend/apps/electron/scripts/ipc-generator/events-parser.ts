import { Node, Project, PropertyDeclaration } from 'ts-morph';

import { type CollectedEventsMap, type ParsedEventInfo } from './types';
import { determineEntry } from './utils';

export const IpcEventDecoratorName = 'IpcEvent';

/**
 * Parses the @IpcEvent decorator and extracts relevant information
 */
export function parseIpcEventDecorator(
  propertyDeclaration: PropertyDeclaration
): Omit<ParsedEventInfo, 'description'> | { error: string } {
  const decorator = propertyDeclaration
    .getDecorators()
    .find(d => d.getName() === IpcEventDecoratorName);
  if (!decorator) return { error: 'Decorator not found' };

  const args = decorator.getArguments();
  const sourceFile = propertyDeclaration.getSourceFile();
  const propertyNameInCode = propertyDeclaration.getName();

  if (args.length === 0) {
    return {
      error: `@${IpcEventDecoratorName} on ${propertyNameInCode} in ${sourceFile.getFilePath()} is missing arguments.`,
    };
  }
  const optionsArg = args[0];
  if (!Node.isObjectLiteralExpression(optionsArg)) {
    return {
      error: `@${IpcEventDecoratorName} on ${propertyNameInCode} in ${sourceFile.getFilePath()} requires an object argument.`,
    };
  }

  let scopeValue: string | undefined;
  const scopeProperty = optionsArg.getProperty('scope');
  if (scopeProperty && Node.isPropertyAssignment(scopeProperty)) {
    const initializer = scopeProperty.getInitializer();
    if (initializer) {
      if (Node.isStringLiteral(initializer))
        scopeValue = initializer.getLiteralValue();
      else if (Node.isPropertyAccessExpression(initializer)) {
        const type = initializer.getType();
        if (type.isStringLiteral())
          scopeValue = type.getLiteralValue() as string;
        else scopeValue = initializer.getNameNode().getText();
      }
    }
  }
  if (!scopeValue)
    return {
      error: `@${IpcEventDecoratorName} on ${propertyNameInCode}: missing valid 'scope'.`,
    };

  let declaredName: string | undefined;
  const nameProperty = optionsArg.getProperty('name');
  if (nameProperty && Node.isPropertyAssignment(nameProperty)) {
    const initializer = nameProperty.getInitializer();
    if (initializer && Node.isStringLiteral(initializer))
      declaredName = initializer.getLiteralValue();
    else if (initializer)
      return {
        error: `@${IpcEventDecoratorName} on ${propertyNameInCode}: 'name' must be a string literal.`,
      };
  }

  const eventName = declaredName ?? propertyNameInCode.replace(/\$$/, '');
  const ipcChannel = `${scopeValue}:${eventName}`;

  let payloadType = 'any[]'; // Default
  const propertyTypeNode = propertyDeclaration.getTypeNode();
  const propertyType = propertyDeclaration.getType(); // Get the full Type object

  // Attempt 1: Regex on TypeNode text (faster, good for common cases)
  if (propertyTypeNode) {
    const typeNodeText = propertyTypeNode.getText();
    // Consolidated regex for known stream types including Observable
    const knownStreamTypesRegex =
      /(?:BehaviorSubject|ReplaySubject|Subject|Observable|EventEmitter)<([^>]+)>/;
    const typeMatch = typeNodeText.match(knownStreamTypesRegex);

    if (typeMatch && typeMatch[1]) {
      payloadType = typeMatch[1].trim();
    }
  }

  // Attempt 2: If regex failed or resulted in default, try more robust Type object inspection
  if (payloadType === 'any[]') {
    // Only if not found by Attempt 1 (explicit type annotation)
    const typesToInspect: import('ts-morph').Type[] = [propertyType];
    if (propertyType.isIntersection()) {
      typesToInspect.push(...propertyType.getIntersectionTypes());
    }

    // Consider base types if the primary type itself is not a directly recognized Observable symbol
    // This helps with classes extending Observable<T>
    const primarySymbolName = propertyType.getSymbol()?.getName();
    const isPrimaryRecognizedObservable = [
      'Subject',
      'BehaviorSubject',
      'ReplaySubject',
      'EventEmitter',
      'Observable',
    ].includes(primarySymbolName || '');

    if (!isPrimaryRecognizedObservable && propertyType.isClassOrInterface()) {
      typesToInspect.push(...propertyType.getBaseTypes());
    }

    for (const typeToInspect of typesToInspect) {
      // Ensure we are dealing with a type that can have generics and a symbol (class/interface)
      // isAnonymous handles cases within intersections that might not be directly isClassOrInterface
      if (
        !typeToInspect.isClassOrInterface() &&
        !typeToInspect.isAnonymous() &&
        !typeToInspect.isObject()
      )
        continue;

      const typeName = typeToInspect.getSymbol()?.getName();
      if (
        typeName === 'Subject' ||
        typeName === 'BehaviorSubject' ||
        typeName === 'ReplaySubject' ||
        typeName === 'EventEmitter' ||
        typeName === 'Observable'
      ) {
        const typeArguments = typeToInspect.getTypeArguments();
        if (typeArguments.length > 0) {
          const argText = typeArguments[0].getText(sourceFile).trim();
          // Prioritize more specific types over 'any' or 'unknown' if multiple paths yield a type.
          if (
            payloadType === 'any[]' ||
            ((payloadType === 'any' || payloadType === 'unknown') &&
              argText !== 'any' &&
              argText !== 'unknown')
          ) {
            payloadType = argText;
          }
          // If we found a concrete type (not any/unknown/any[]), we can stop searching.
          if (
            payloadType !== 'any' &&
            payloadType !== 'unknown' &&
            payloadType !== 'any[]'
          ) {
            break; // Found a good type from typesToInspect loop
          }
        }
        // If typeArguments is empty here, it implies Observable (or Subject, etc.) without a generic.
        // The later fallback `if (payloadType === 'any[]') payloadType = 'any'` will handle this.
      }
    }
    // If, after checking all typesToInspect, payloadType is still 'any[]' or a non-specific type,
    // and we found a specific type from the primary propertyType earlier (even if it was 'any'),
    // we might need to ensure the most specific one found is kept.
    // However, the current logic of only updating if more specific should handle this.
  }

  // Attempt 3: Look at initializer expression (e.g., new Subject<void>()) if still default
  if (payloadType === 'any[]') {
    const initializer = propertyDeclaration.getInitializer();
    if (initializer && Node.isNewExpression(initializer)) {
      const typeArgs = initializer.getType().getTypeArguments();
      if (typeArgs.length > 0) {
        payloadType = typeArgs[0].getText(sourceFile).trim();
      }
    }
  }

  // If still default any[] but we have detected Subject without generic, treat as any not array
  if (payloadType === 'any[]') {
    payloadType = 'any';
  }

  // Final cleanup for void
  if (payloadType.toLowerCase() === 'void') {
    payloadType = ''; // Represent void as empty params for callback
  }

  return {
    scope: scopeValue,
    eventName,
    ipcChannel,
    payloadType,
    originalPropertyName: propertyNameInCode,
    entry: determineEntry(sourceFile.getFilePath()),
    filePath: sourceFile.getFilePath(),
  };
}

/**
 * Parses all IPC events in the project and collects their information
 */
export function parseIpcEvents(project: Project): {
  events: CollectedEventsMap;
} {
  const collectedEvents: CollectedEventsMap = new Map();

  project.getSourceFiles().forEach(sourceFile => {
    sourceFile.getClasses().forEach(classDeclaration => {
      classDeclaration.getProperties().forEach(propertyDeclaration => {
        const decorator = propertyDeclaration
          .getDecorators()
          .find(d => d.getName() === IpcEventDecoratorName);
        if (!decorator) return;

        const parsedEventInfo = parseIpcEventDecorator(propertyDeclaration);
        if ('error' in parsedEventInfo) {
          if (parsedEventInfo.error !== 'Decorator not found')
            console.error(`[Event ERR] ${parsedEventInfo.error}`);
          return;
        }

        const {
          scope,
          eventName,
          payloadType,
          entry,
          filePath,
          originalPropertyName,
        } = parsedEventInfo;

        // derive modulePath and className here
        const absPath = filePath as string;
        const idx = absPath.lastIndexOf('/src/');
        let modulePath = absPath;
        if (idx !== -1) {
          modulePath =
            '@affine/electron/' + absPath.substring(idx + '/src/'.length);
        }
        modulePath = modulePath.replace(/\.[tj]sx?$/, '');

        const clsName =
          propertyDeclaration.getParent()?.getName?.() || 'UnknownClass';
        const propName = originalPropertyName;
        const description = propertyDeclaration
          .getJsDocs()
          .map(doc => doc.getDescription().trim())
          .filter(Boolean)
          .join('\n');

        if (!collectedEvents.has(scope)) collectedEvents.set(scope, []);
        const eventScopeMethods = collectedEvents.get(scope);
        if (eventScopeMethods) {
          const existingEvent = eventScopeMethods.find(
            event => event.eventName === eventName
          );
          if (existingEvent) {
            throw new Error(
              `[Event ERR] Duplicate event found for scope '${scope}' and eventName '${eventName}'.\n` +
                `  Original: ${existingEvent.filePath} (${existingEvent.className}.${existingEvent.propertyName})\n` +
                `  Duplicate: ${filePath as string} (${clsName}.${propName})`
            );
          }
          eventScopeMethods.push({
            eventName,
            payloadType,
            modulePath,
            className: clsName,
            propertyName: propName,
            description,
            entry,
            filePath: filePath as string,
          });
        } else {
          console.error(
            `[CRITICAL] Failed to retrieve event methods array for scope: ${scope}`
          );
        }
      });
    });
  });

  return {
    events: collectedEvents,
  };
}
