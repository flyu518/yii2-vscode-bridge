'use strict';

const vscode = require('vscode');
const { resolveMemberContext } = require('../resolver');
const { getShortPath } = require('../indexer');

async function inspectSymbol(getIndex) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Yii2 Bridge needs an active editor.');
    return;
  }

  const context = resolveMemberContext(editor.document, editor.selection.active, getIndex());
  if (!context) {
    vscode.window.showInformationMessage('No Yii symbol could be resolved at the current cursor position.');
    return;
  }

  const lines = [
    `member: ${context.member.name}`,
    `receiver: ${context.receiverType}`,
    `type: ${context.member.type || 'unknown'}`,
    `sourceKind: ${context.member.sourceKind || 'unknown'}`
  ];

  if (context.member.owner) {
    lines.push(`owner: ${context.member.owner}`);
  }

  if (context.member.sourceUri) {
    lines.push(`source: ${getShortPath(context.member.sourceUri)}:${(context.member.line || 0) + 1}`);
  }

  if (context.member.detail) {
    lines.push(`resolvedFrom: ${oneLine(context.member.detail)}`);
  }

  await vscode.window.showInformationMessage(lines.join(' | '));
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

module.exports = {
  inspectSymbol
};
