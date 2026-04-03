# Yii2 VSCode Bridge

Yii2 VSCode Bridge 是一个面向 Yii2 项目的桥接扩展，主要用于配合 PHP Intelephense 使用，增强其在 VSCode、Cursor 等编辑器中的补全、跳转与悬停体验。

它不是用来替代 Intelephense，而是作为补充层，为 `Yii::$app`、`params`、动态属性、getter、关系方法等 Yii2 常见场景提供更好的编辑器支持。

它不局限于 VSCode，只要是兼容 VSCode 扩展生态的编辑器都可以使用，例如 VSCode、Cursor 等。

目前默认兼容 Yii2 高级版和基础版目录结构：

- 高级版：`api/`、`common/`、`console/`
- 基础版：根目录 `config/`、`models/`、`controllers/`、`components/`、`services/`、`commands/`

## 适用场景

适用于已经使用 PHP Intelephense，但在 Yii2 项目中经常遇到以下问题的场景：

- `Yii::$app->db`、`Yii::$app->getDb()` 无法正确补全或跳转
- `Yii::$app->params[...]` 无法识别参数键来源
- ActiveRecord 的动态属性、getter、关系方法提示不足
- 在基于 VSCode 的编辑器里，Yii2 项目体验明显弱于 PhpStorm

## 功能说明

### 支持

- `Yii::$app->component` 属性补全
  来源：`ide.php`、`config/__autocomplete.php`、Yii config、内置组件映射
  备注：适合 `db`、`request`、`cache` 等组件
- `Yii::$app->getXxx()` 方法补全
  来源：应用类及父类方法索引
  备注：例如 `getDb()`
- `Yii::$app->params['key']` 字面量参数键提示/跳转
  来源：`params.php` / `params-local.php` 顶层键索引
  备注：支持顶层键
- 静态数组 `params` 子键提示/跳转
  来源：`params.php` / `params-local.php` 字面量数组结构
  备注：支持多层静态数组链，例如 `minio_cloud_conf['list']['omni']['bucket']`
- `\Yii::$app->...` 补全
  来源：同上
  备注：与 `Yii::$app` 等价处理
- `$this->property` / `$this->method()` 解析
  来源：当前类、父类、注释、getter、关系方法
  备注：依赖类索引结果
- 已知局部变量 `->...` 解析
  来源：局部上下文推断 + 类索引
  备注：覆盖当前已实现的几类赋值模式
- `Yii::createObject(...)` 结果对象解析
  来源：`createObject` 参数 + 类索引
  备注：仅支持常见直传类名和字符串类名
- 悬停显示类型和来源
  来源：解析结果
  备注：显示 member、type、sourceKind、receiver、owner、file
- 跳转定义
  来源：stub / config / 类成员 / 类文件
  备注：优先跳到定义点，缺失时回退到类文件
- `Inspect Symbol` 命令
  来源：当前光标解析结果
  备注：用于查看桥接层如何解析当前符号
- `Reindex Project` 命令
  来源：全量索引构建
  备注：手动重建索引
- `Apply Workspace Settings` 命令
  来源：写入 `.vscode/settings.json`
  备注：用于应用推荐的 Intelephense 设置
- 保存后自动重建索引
  来源：文件保存事件
  备注：监听 `ide.php`、config、`api/common/console`、Yii vendor 文件
- 组件索引来源
  来源：`ide.php`、Yii config、内置组件映射
  备注：`ide.php` 优先于 config，`*-local.php` 优先级更高
- 类成员索引来源
  来源：类注释、getter、返回类型、关系方法、继承链
  备注：同时覆盖属性和方法解析

### 部分支持

- `Yii::$app->params[$key]` 动态参数键静态推断
  来源：变量字面量回溯 + 参数索引
  备注：仅支持当前文件附近能静态看出的字符串分支，不是运行时变量值求值

### 不支持

- 完整替代 Intelephense
  备注：这是补充层，不是语言服务器替换
- 直接消除所有 Intelephense 误报
  备注：只能减少一部分 Yii 动态场景误报
- 任意动态 PHP 代码求值
  备注：不执行运行时代码
- 从 `ide.php` 的 `@method` 生成组件条目
  备注：当前 `ide.php` 组件索引只读取 `@property`

## 当前可配置项

- `yii2Bridge.ideStubFiles`
- `yii2Bridge.configFiles`
- `yii2Bridge.enableBuiltInComponents`
- `yii2Bridge.classFiles`
- `yii2Bridge.paramsFiles`

## 命令

- `Yii2 Bridge: Apply Workspace Settings`
- `Yii2 Bridge: Reindex Project`
- `Yii2 Bridge: Inspect Symbol`

## 来源与优先级

插件会从下面这些位置提取属性、方法和类型信息。想让某个成员被正确识别，优先把信息补到这些位置。

### 1. `ide.php`

- 文件位置：通常是项目根目录的 `ide.php`，或基础版项目里的 `config/__autocomplete.php`
- 读取方式：解析类注释里的 `@property`
- 适合放什么：
  - `Yii::$app->redis`
  - `Yii::$app->mutex`
  - 其他自定义 application 组件

示例：

```php
/**
 * @property \yii\db\Connection $db
 * @property \api\components\redis\Connection $redis
 */
class MyApplication
{
}
```

### 2. Yii 配置文件里的 `components`

- 读取范围默认包括：
  - `common/config/*.php`
  - `common/config/*-local.php`
  - `api/config/*.php`
  - `api/config/*-local.php`
  - `console/config/*.php`
  - `console/config/*-local.php`
  - `config/*.php`
- 读取方式：扫描 `components` 数组里的 `class`
- 适合放什么：
  - `db`
  - `cache`
  - `redis`
  - `request`
  - `response`
  - 其他 application 组件

示例：

```php
'components' => [
    'db' => [
        'class' => 'yii\db\Connection',
    ],
    'redis' => [
        'class' => \api\components\redis\Connection::class,
    ],
],
```

说明：

- 同名组件会按优先级覆盖，`*-local.php` 会高于普通 `*.php`
- 当前实现是静态扫描，不会执行 PHP 代码

### 3. 类注释 `@property`

- 读取范围：被索引到的 PHP 类文件
- 读取方式：解析类注释里的 `@property`
- 适合放什么：
  - ActiveRecord 字段
  - 虚拟属性
  - 关系属性

示例：

```php
/**
 * @property int $id
 * @property Recognition $recognition
 */
class Alert extends BaseModel
{
}
```

### 4. Getter 方法 `getXxx()`

- 读取范围：类中的公共/受保护 `getXxx()` 方法
- 读取方式：读取返回类型声明或 `@return`
- 适合放什么：
  - `Yii::$app->getDb()`
  - `$this->db`
  - `$this->someVirtualProperty`

示例：

```php
/**
 * @return \yii\db\Connection
 */
public function getDb()
{
    return $this->get('db');
}
```

说明：

- `getDb()` 会同时被当作方法 `getDb()` 和属性 `db` 的来源

### 5. 关系方法 `hasOne()` / `hasMany()`

- 读取范围：模型中的 `getXxx()` 关系方法
- 读取方式：识别方法体中的 `hasOne()` / `hasMany()`
- 适合放什么：
  - ActiveRecord 关系属性

示例：

```php
public function getRecognition()
{
    return $this->hasOne(Recognition::class, ['id' => 'recognitionId']);
}
```

说明：

- `hasOne(Foo::class)` 会推导成 `Foo`
- `hasMany(Foo::class)` 会推导成 `Foo[]`

### 6. 局部变量上下文

- 读取方式：回看当前文件附近代码，识别：
  - `@var`
  - `new Xxx()`
  - `Xxx::find()`
  - `Yii::$app->...`
  - `Yii::createObject(...)`
- 适合放什么：
  - 只在当前文件/当前作用域里需要的推断

### 7. 参数文件 `params.php` / `params-local.php`

- 读取范围默认包括：
  - `common/config/params*.php`
  - `api/config/params*.php`
  - `console/config/params*.php`
  - `config/params*.php`
- 读取方式：扫描 `return [...]` 顶层数组键
- 适合放什么：
  - `Yii::$app->params['detect_config']`
  - `Yii::$app->params['detect_config_single']`
  - 其他全局顶层参数键

说明：

- 静态字面量数组会继续索引子键，支持多层链式访问，例如 `detect_config['num']`、`minio_cloud_conf['list']['omni']['bucket']`
- 动态来源的值如果无法静态展开，仍然只保留顶层键
- 同名参数键会按优先级覆盖，`*-local.php` 会高于普通 `*.php`


### 推荐做法

- 应用级组件：优先写到 `ide.php` 或配置文件 `components`
- 全局参数键：优先写到 `params.php` / `params-local.php` 顶层
- 模型字段/虚拟属性：优先写到类注释 `@property`
- 虚拟 getter：优先补 `getXxx()` 的 `@return`
- 关系属性：优先写标准 `getXxx()` + `hasOne()` / `hasMany()`

如果一个成员没有被识别，优先检查：

1. 它是否存在于上面这些来源之一
2. 类型是否写成了静态可解析的形式
3. 改完后是否执行了 `Yii2 Bridge: Reindex Project`

## 安装方式

1. 先打包生成 `.vsix`：

```bash
cd yii2-vscode-bridge
npx @vscode/vsce package
```

2. 在 VSCode 中安装：

```bash
code --install-extension /绝对路径/yii2-vscode-bridge-0.0.1.vsix
```

3. 在 Cursor 中安装：

```bash
cursor --install-extension /绝对路径/yii2-vscode-bridge-0.0.1.vsix
```

4. 也可以通过兼容 VSCode 扩展生态的编辑器界面安装：
   扩展面板 -> `...` -> `Install from VSIX...`

## 推荐用法

- 如果项目中有 `ide.php`，建议将其放在项目根目录。
- 每个工作区执行一次工作区设置命令。
- 修改 `ide.php` 或配置文件后，重新运行 `Yii2 Bridge: Reindex Project`。
- 安装后建议执行一次 `Yii2 Bridge: Apply Workspace Settings`，然后重载窗口。
