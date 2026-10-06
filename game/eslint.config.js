import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';

// 客户端样式只允许走语义令牌：调色板类名、十六进制与 rgb / hsl 颜色字面量一律禁止回流
const PALETTE_CLASS =
  '(?<![\\w-])(?:[a-z0-9\\[\\]&>*-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline|divide|decoration|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-[0-9]+)?(?![\\w-])';
const LEGACY_TOKEN_CLASS =
  '(?<![\\w-])(?:bg-bg-(?:primary|secondary|card)|text-text-(?:primary|secondary)|[a-z:-]*accent-hover)(?![\\w-])';
const COLOR_LITERAL =
  '(?<![\\w&])#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?(?![\\w-])|\\b(?:rgba?|hsla?)\\(';

const noHardcodedColorRules = [
  {
    pattern: PALETTE_CLASS,
    message:
      '禁止使用 Tailwind 调色板类名（如 bg-red-500、text-white）。请改用语义令牌类名：background / panel / panel-2 / foreground / dim / faint / line / line-strong / acc / acc-bright / acc-soft / lock / blood / ok / grade。',
  },
  {
    pattern: LEGACY_TOKEN_CLASS,
    message:
      '禁止使用旧固定深色令牌类名（bg-bg-*、text-text-*、accent-hover）。请改用语义令牌类名：bg-background / bg-panel / bg-panel-2 / text-foreground / text-dim / bg-primary。',
  },
  {
    pattern: COLOR_LITERAL,
    message:
      '禁止硬编码十六进制或 rgb / hsl 颜色。请改用语义令牌（如 var(--ms-acc)、color-mix(in srgb, var(--ms-acc) 40%, transparent)）或对应的类名。',
  },
].flatMap(({ pattern, message }) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
]);

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
  eslintConfigPrettier,
  {
    files: ['packages/client/src/**/*.{ts,tsx}'],
    ignores: [
      'packages/client/src/**/*.test.{ts,tsx}',
      'packages/client/src/theme/**',
      'packages/client/src/components/PixelAvatar/**',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...noHardcodedColorRules],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**'],
  },
);
