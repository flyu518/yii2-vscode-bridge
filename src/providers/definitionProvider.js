'use strict';

const vscode = require('vscode');
const { resolveClassFile } = require('../indexer');
const { resolveMemberContext } = require('../resolver');

class YiiAppDefinitionProvider {
  constructor(getIndex) {
    this.getIndex = getIndex;
  }

  async provideDefinition(document, position) {
    const context = resolveMemberContext(document, position, this.getIndex());
    if (!context) {
      return null;
    }

    if (context.member.sourceUri && typeof context.member.line === 'number') {
      if (context.extraTargets && context.extraTargets.length > 1) {
        return context.extraTargets.map((target) => new vscode.Location(target.sourceUri, new vscode.Position(target.line || 0, 0)));
      }

      return new vscode.Location(context.member.sourceUri, new vscode.Position(context.member.line, 0));
    }

    const classFile = await resolveClassFile(context.member.type || context.receiverType);
    if (classFile) {
      return new vscode.Location(classFile, new vscode.Position(0, 0));
    }

    return null;
  }
}

module.exports = {
  YiiAppDefinitionProvider
};
