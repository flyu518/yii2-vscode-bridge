'use strict';

const assert = require('assert');
const path = require('path');
const { parseIdeStub } = require('../parsers/ideStubParser');
const { parseConfigComponents } = require('../parsers/configParser');
const { parsePhpClass } = require('../parsers/phpClassParser');
const { parseParamsFile } = require('../parsers/paramsParser');

function run() {
  const ideFixture = [
    '<?php',
    '/**',
    ' * @property \\yii\\db\\Connection $db',
    ' * @property api\\components\\redis\\Connection $redis',
    ' */',
    'class MyApplication {}'
  ].join('\n');

  const ideComponents = parseIdeStub(ideFixture, fakeUri('ide.php'));
  assert.strictEqual(ideComponents.length, 2);
  assert.strictEqual(ideComponents[0].name, 'db');
  assert.strictEqual(ideComponents[0].type, '\\yii\\db\\Connection');

  const autocompleteFixture = [
    '<?php',
    '/**',
    ' * Example: @property \\vendor\\package\\Rollbar|__Rollbar $rollbar',
    ' */',
    'class Yii {}',
    '',
    '/**',
    ' * @property \\yii\\web\\User|__WebUser $user',
    ' * @property app\\components\\redis\\Mutex $mutex',
    ' */',
    'class __Application {}'
  ].join('\n');

  const autocompleteComponents = parseIdeStub(autocompleteFixture, fakeUri('__autocomplete.php'));
  assert.strictEqual(autocompleteComponents.length, 2);
  assert.strictEqual(autocompleteComponents[0].name, 'user');

  const configFixture = [
    '<?php',
    'return [',
    "    'components' => [",
    "        'db' => [",
    "            'class' => 'yii\\\\db\\\\Connection',",
    '        ],',
    "        'redis' => [",
    "            'class' => api\\components\\redis\\Connection::class,",
    '        ],',
    '    ],',
    '];'
  ].join('\n');

  const configComponents = parseConfigComponents(configFixture, fakeUri('config.php'));
  assert.strictEqual(configComponents.length, 2);
  assert.strictEqual(configComponents[0].name, 'db');
  assert.strictEqual(configComponents[0].type, 'yii\\db\\Connection');
  assert.strictEqual(configComponents[1].type, 'api\\components\\redis\\Connection');

  const classFixture = [
    '<?php',
    'namespace api\\models;',
    '',
    'use yii\\db\\ActiveRecord;',
    '',
    '/**',
    ' * @property int $id',
    ' * @property Recognition $recognition',
    ' */',
    'class Alert extends ActiveRecord',
    '{',
    '    /**',
    '     * @return \\yii\\db\\ActiveQuery',
    '     */',
    '    public function getRecognition()',
    '    {',
    '        return $this->hasOne(Recognition::class, [\'id\' => \'recognitionId\']);',
    '    }',
    '}'
  ].join('\n');

  const parsedClass = parsePhpClass(classFixture, fakeUri('Alert.php'));
  assert.ok(parsedClass);
  assert.strictEqual(parsedClass.fqcn, 'api\\models\\Alert');
  assert.strictEqual(parsedClass.properties.get('id').type, 'int');
  assert.strictEqual(parsedClass.properties.get('recognition').type, 'api\\models\\Recognition');
  assert.strictEqual(parsedClass.methods.get('getRecognition').type, 'api\\models\\Recognition');

  const appFixture = [
    '<?php',
    'namespace yii\\base;',
    '',
    'class Application',
    '{',
    '    /**',
    '     * @var array custom module parameters (name => value).',
    '     */',
    '    public $params = [];',
    '',
    '    /**',
    '     * @return \\yii\\db\\Connection',
    '     */',
    '    public function getDb()',
    '    {',
    "        return $this->get('db');",
    '    }',
    '}'
  ].join('\n');

  const parsedAppClass = parsePhpClass(appFixture, fakeUri('Application.php'));
  assert.strictEqual(parsedAppClass.methods.get('getDb').type, 'yii\\db\\Connection');
  assert.strictEqual(parsedAppClass.properties.get('params').type, 'array');

  const paramsFixture = [
    '<?php',
    'return [',
    "    'detect_config' => [",
    "        'num' => 1,",
    '    ],',
    "    'detect_config_single' => [",
    "        'num' => 2,",
    '    ],',
    '];'
  ].join('\n');

  const paramsEntries = parseParamsFile(paramsFixture, fakeUri('params-local.php'));
  assert.strictEqual(paramsEntries.length, 2);
  assert.strictEqual(paramsEntries[0].name, 'detect_config');
  assert.strictEqual(paramsEntries[0].type, 'array');
  assert.strictEqual(paramsEntries[0].children[0].name, 'num');

  const deepParamsFixture = [
    '<?php',
    'return [',
    "    'minio_cloud_conf' => [",
    "        'list' => [",
    "            'omni' => [",
    "                'bucket' => 'omni',",
    '            ],',
    '        ],',
    '    ],',
    '];'
  ].join('\n');
  const deepParamsEntries = parseParamsFile(deepParamsFixture, fakeUri('deep-params.php'));
  assert.strictEqual(deepParamsEntries[0].children[0].name, 'list');
  assert.strictEqual(deepParamsEntries[0].children[0].children[0].name, 'omni');
  assert.strictEqual(deepParamsEntries[0].children[0].children[0].children[0].name, 'bucket');

  process.stdout.write('parserSelfCheck: OK\n');
}

function fakeUri(fileName) {
  return {
    fsPath: path.join(process.cwd(), fileName)
  };
}

run();
