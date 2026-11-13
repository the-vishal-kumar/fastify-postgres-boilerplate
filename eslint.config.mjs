import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  { ignores: ['build/**', 'coverage/**', 'node_modules/**', '.cache/**'] },
  ...tseslint.configs.recommendedTypeChecked,
  prettierRecommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { project: './tsconfig.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      eqeqeq: 2,
      '@typescript-eslint/no-floating-promises': 2,
      '@typescript-eslint/explicit-module-boundary-types': 2,
      '@typescript-eslint/consistent-type-imports': 2,
    },
  },
  {
    // node:test's describe() and it() return promises the runner awaits itself.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 0,
      '@typescript-eslint/no-unsafe-member-access': 0,
    },
  },
);
