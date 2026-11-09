import tseslint from 'typescript-eslint';

// لغة التنسيق لازم تتحدد صراحةً: أي استدعاء toLocale* بدون لغة بيتبع لغة الجهاز.
const localeRule = [
  'error',
  {
    selector:
      "CallExpression[callee.property.name=/^toLocale(String|DateString|TimeString)$/][arguments.length=0]",
    message: 'ممنوع toLocale* بدون تحديد اللغة. استخدم دوال src/core/digits و src/core/date.',
  },
  {
    selector: "NewExpression[callee.object.name='Intl'][arguments.length=0]",
    message: 'ممنوع Intl بدون تحديد اللغة.',
  },
  {
    selector: "CallExpression[callee.object.name='Intl'][arguments.length=0]",
    message: 'ممنوع Intl بدون تحديد اللغة.',
  },
];

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': localeRule,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
