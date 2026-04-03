# Changelog

## 0.0.2

- 修复 `params.php` / `params-local.php` 静态数组解析在真实配置文件中的回归问题，恢复顶层参数键索引。
- 新增任意层级静态数组键链解析，支持 `Yii::$app->params['a']['b']['c']` 这类多层补全、悬停和跳转。
- 新增对由 `Yii::$app->params[...]` 派生出的局部变量数组访问解析，例如 `$conf['domain']`。
- 修复数组键 completed context 匹配问题，恢复顶层键和深层键的悬停与跳转定义。
- 补充基础版 Yii2 项目目录兼容与 `config/__autocomplete.php` 支持。

## 0.0.1

- Initial local release of the Yii2 VSCode Bridge extension.
- Added completion, hover, and definition support for `Yii::$app->component`.
- Added support for `Yii::$app->getXxx()` methods.
- Added indexing for `ide.php`, Yii `components` config, class docblocks, getter methods, and relation methods.
- Added support for top-level `params.php` / `params-local.php` keys.
- Added `Inspect Symbol`, `Reindex Project`, and `Apply Workspace Settings` commands.
