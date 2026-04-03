'use strict';

function parseDocblockProperties(docblock) {
  const properties = [];
  const pattern = /@property(?:-read|-write)?\s+([^\s]+)\s+\$([A-Za-z_]\w*)/g;
  let match;

  while ((match = pattern.exec(docblock)) !== null) {
    properties.push({
      name: match[2],
      type: match[1],
      detail: match[0].trim()
    });
  }

  return properties;
}

function parseDocblockReturnType(docblock) {
  const match = docblock.match(/@return\s+([^\s]+)/);
  return match ? match[1] : undefined;
}

module.exports = {
  parseDocblockProperties,
  parseDocblockReturnType
};
