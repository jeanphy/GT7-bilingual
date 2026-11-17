import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', '_site/**/*'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
