import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettier,
    },
    rules: {
      // Prefer the TypeScript rule; disable the base rule
      'no-unused-vars': 'off',

      // TypeScript specific loose rules
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-inferrable-types': 'off',

      // Prettier integration
      'prettier/prettier': [
        'warn',
        {
          singleQuote: true,
          semi: true,
          arrowParens: 'always',
          printWidth: 100,
          trailingComma: 'es5',
        },
      ],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
    },
  },
  // JavaScript files
  {
    files: ['**/*.js', '**/*.jsx'],
    plugins: {
      prettier: prettier,
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'warn',
      'prettier/prettier': [
        'warn',
        {
          singleQuote: true,
          semi: true,
          arrowParens: 'always',
          printWidth: 100,
          trailingComma: 'es5',
        },
      ],
    },
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'lib/**', '*.d.ts'],
  },
];
