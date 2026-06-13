import { Converter } from 'typedoc';

export function load(app) {
  app.converter.on(Converter.EVENT_RESOLVE_END, context => {
    pruneInheritedReflections(context.project);
  });
}

function pruneInheritedReflections(reflection) {
  if (reflection.children) {
    reflection.children = reflection.children.filter(
      child => !child.inheritedFrom
    );
    reflection.children.forEach(pruneInheritedReflections);
  }

  if (reflection.groups) {
    reflection.groups = reflection.groups
      .map(group => ({
        ...group,
        children: group.children.filter(child => !child.inheritedFrom),
      }))
      .filter(group => group.children.length > 0);
  }

  if (reflection.categories) {
    reflection.categories = reflection.categories
      .map(category => ({
        ...category,
        children: category.children.filter(child => !child.inheritedFrom),
      }))
      .filter(category => category.children.length > 0);
  }
}
