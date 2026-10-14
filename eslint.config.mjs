import antfu from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  rules: {
    // 测试统一用 node:test(内置运行器),不引入 vitest
    'test/no-import-node-test': 'off',
  },
  ignores: [
    // 生成物与静态资源不参与 lint
    'dist/**',
    'coverage/**',
    'test/build/**',
    'doc/**',
    'docs/**',
    'sample/**',
    'snippets/**',
    'syntaxes/**',
    'src/lsp/krpanoData.json',
  ],
})
