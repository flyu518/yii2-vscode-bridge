# Release Guide

## Local package

```bash
npm install
npx @vscode/vsce package
```

The generated package will be:

```text
yii2-vscode-bridge-<version>.vsix
```

## Install locally

### VSCode

```bash
code --install-extension /absolute/path/yii2-vscode-bridge-<version>.vsix
```

### Cursor

```bash
cursor --install-extension /absolute/path/yii2-vscode-bridge-<version>.vsix
```

## Suggested GitHub release flow

1. Update `package.json` version.
2. Update `CHANGELOG.md`.
3. Run:

```bash
npx @vscode/vsce package
```

4. Create a GitHub Release with the same version tag.
5. Upload the generated `.vsix` as a release asset.
6. Copy install instructions from `README.md`.
