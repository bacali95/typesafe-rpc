module.exports = {
  printWidth: 100,
  singleQuote: true,
  importOrder: ['typesafe-rpc', '^[./]'],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
  importOrderParserPlugins: ['typescript', 'decorators-legacy'],
  plugins: ['@trivago/prettier-plugin-sort-imports'],
};
