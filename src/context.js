'use strict';

function getObjectAccessContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const linePrefix = lineText.slice(0, position.character);
  const match = linePrefix.match(/((?:\\?Yii::\$app)|(?:\\?Yii::createObject\([^)]*\))|(?:\$this)|(?:\$[A-Za-z_]\w*))\s*->\s*([A-Za-z_]*)$/);

  if (!match) {
    return null;
  }

  return {
    receiver: match[1],
    prefix: match[2],
    lineText
  };
}

function getParamsAccessContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const linePrefix = lineText.slice(0, position.character);
  const context = parseIncompleteArrayAccess(linePrefix);
  if (!context || context.receiver.replace(/^\\/, '') !== 'Yii::$app->params' || context.path.length > 0) {
    return null;
  }

  return {
    prefix: context.prefix
  };
}

function getArrayAccessContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const linePrefix = lineText.slice(0, position.character);
  return parseIncompleteArrayAccess(linePrefix);
}

function getCompletedObjectAccessContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const range = document.getWordRangeAtPosition(position);
  if (!range) {
    return null;
  }

  const word = document.getText(range);
  const linePrefix = lineText.slice(0, range.end.character);
  const match = linePrefix.match(/((?:\\?Yii::\$app)|(?:\\?Yii::createObject\([^)]*\))|(?:\$this)|(?:\$[A-Za-z_]\w*))\s*->\s*([A-Za-z_]\w*)$/);
  if (!match || match[2] !== word) {
    return null;
  }

  return {
    receiver: match[1],
    member: match[2],
    isMethodCall: lineText.slice(range.end.character).trimStart().startsWith('('),
    range,
    lineText
  };
}

function getCompletedParamsAccessContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const range = document.getWordRangeAtPosition(position, /[^'"[\]]+/);
  if (!range) {
    return null;
  }

  const word = document.getText(range);
  const linePrefix = lineText.slice(0, range.end.character);
  const context = parseCompletedArrayAccess(linePrefix);
  if (!context || context.receiver.replace(/^\\/, '') !== 'Yii::$app->params' || context.path.length > 0) {
    return null;
  }

  if (context.keyKind === 'literal' && context.keyName === word) {
    return {
      keyName: word,
      keyKind: 'literal',
      range
    };
  }

  if (context.keyKind === 'variable' && context.keyName === word) {
    return {
      keyName: word,
      keyKind: 'variable',
      range
    };
  }

  return null;
}

function getCompletedArrayAccessContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const range = document.getWordRangeAtPosition(position, /[^'"[\]]+/);
  if (!range) {
    return null;
  }

  const word = document.getText(range);
  const linePrefix = lineText.slice(0, range.end.character);
  const context = parseCompletedArrayAccess(linePrefix);
  if (!context || context.keyKind !== 'literal' || context.keyName !== word) {
    return null;
  }

  return {
    receiver: context.receiver,
    path: context.path,
    keyName: word,
    range
  };
}

function parseIncompleteArrayAccess(linePrefix) {
  const match = linePrefix.match(/((?:\\?Yii::\$app->params)|(?:\$[A-Za-z_]\w*))((?:\s*\[\s*(?:'[^']*'|"[^"]*"|\$[A-Za-z_]\w*)\s*\])*)\s*\[\s*['"]([^'"]*)$/);
  if (!match) {
    return null;
  }

  return {
    receiver: normalizeReceiver(match[1]),
    path: parseKeySegments(match[2]).filter((segment) => segment.kind === 'literal').map((segment) => segment.value),
    prefix: match[3]
  };
}

function parseCompletedArrayAccess(linePrefix) {
  const match = linePrefix.match(/((?:\\?Yii::\$app->params)|(?:\$[A-Za-z_]\w*))((?:\s*\[\s*(?:'[^']*'|"[^"]*"|\$[A-Za-z_]\w*)\s*\])*)\s*\[\s*(?:'([^']+)|"([^"]+)|(\$[A-Za-z_]\w*))$/);
  if (!match) {
    return null;
  }

  const keyName = match[3] || match[4] || match[5];
  return {
    receiver: normalizeReceiver(match[1]),
    path: parseKeySegments(match[2]).filter((segment) => segment.kind === 'literal').map((segment) => segment.value),
    keyKind: match[5] ? 'variable' : 'literal',
    keyName
  };
}

function parseKeySegments(chain) {
  const values = [];
  for (const match of String(chain).matchAll(/\[\s*('([^']*)'|"([^"]*)"|(\$[A-Za-z_]\w*))\s*\]/g)) {
    if (match[4]) {
      values.push({ kind: 'variable', value: match[4] });
      continue;
    }

    values.push({ kind: 'literal', value: match[2] || match[3] || '' });
  }

  return values;
}

function normalizeReceiver(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

module.exports = {
  getObjectAccessContext,
  getParamsAccessContext,
  getArrayAccessContext,
  getCompletedObjectAccessContext,
  getCompletedParamsAccessContext,
  getCompletedArrayAccessContext
};
