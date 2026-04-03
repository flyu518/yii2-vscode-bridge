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
  const match = linePrefix.match(/\\?Yii::\$app->params\[\s*['"]([^'"]*)$/);
  if (!match) {
    return null;
  }

  return {
    prefix: match[1]
  };
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
  const literalMatch = linePrefix.match(/\\?Yii::\$app->params\[\s*['"]([^'"]+)$/);
  if (literalMatch && literalMatch[1] === word) {
    return {
      keyName: word,
      keyKind: 'literal',
      range
    };
  }

  const variableMatch = linePrefix.match(/\\?Yii::\$app->params\[\s*(\$[A-Za-z_]\w*)$/);
  if (variableMatch && variableMatch[1] === word) {
    return {
      keyName: word,
      keyKind: 'variable',
      range
    };
  }

  return null;
}

module.exports = {
  getObjectAccessContext,
  getParamsAccessContext,
  getCompletedObjectAccessContext,
  getCompletedParamsAccessContext
};
