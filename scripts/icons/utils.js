const changeCase = require('change-case');

/**
 * Filter icons by icon pascal name.
 * @param {Array<{id: string; name: string}>} icons
 * @returns {Array<{id: string; name: string}>}
 */
function iconNameFilter(icons) {
  const set = new Set();
  const repeatNames = new Set();

  const filtered = icons.filter(icon => {
    const name = changeCase.pascalCase(icon.name);
    if (set.has(name)) {
      repeatNames.add(name);
      return false;
    }
    set.add(name);
    return true;
  });

  if (repeatNames.size) {
    console.warn(`Warning: repeat names: ${Array.from(repeatNames)}`);
  }

  return filtered;
}

module.exports = {
  iconNameFilter,
};
