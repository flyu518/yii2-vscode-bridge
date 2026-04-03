'use strict';

function parseParamsFile(content, sourceUri) {
  const lines = content.split(/\r?\n/);
  const startLine = findReturnArrayLine(lines);
  if (startLine === -1) {
    return [];
  }

  const entries = [];
  let depth = bracketDelta(lines[startLine]);

  for (let index = startLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = depth === 1 ? line.match(/^\s*['"]([^'"]+)['"]\s*=>/) : null;
    if (keyMatch) {
      entries.push({
        name: keyMatch[1],
        sourceKind: 'params',
        sourceUri,
        line: index,
        detail: line.trim()
      });
    }

    depth += bracketDelta(line);
    if (depth <= 0) {
      break;
    }
  }

  return entries;
}

function findReturnArrayLine(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (/return\s*\[/.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

function bracketDelta(line) {
  let delta = 0;
  for (const char of line) {
    if (char === '[') {
      delta += 1;
    } else if (char === ']') {
      delta -= 1;
    }
  }

  return delta;
}

module.exports = {
  parseParamsFile
};
