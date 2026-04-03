'use strict';

function parseIdeStub(content, sourceUri) {
  const components = [];
  const lines = content.split(/\r?\n/);
  const propertyPattern = /@property(?:-read|-write)?\s+([^\s]+)\s+\$([A-Za-z_]\w*)/g;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let match;
    while ((match = propertyPattern.exec(line)) !== null) {
      components.push({
        name: match[2],
        type: normalizePhpDocType(match[1]),
        sourceKind: 'ide.php',
        sourceUri,
        line: index,
        detail: line.trim()
      });
    }
  }

  return components;
}

function normalizePhpDocType(rawType) {
  if (!rawType) {
    return undefined;
  }

  return rawType.replace(/^\|+|\|+$/g, '').replace(/\\\\/g, '\\').trim();
}

module.exports = {
  parseIdeStub
};
