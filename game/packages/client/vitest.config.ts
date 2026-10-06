import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';
import { coverageOptions } from '../../vitest.shared';

// 沿用 vite.config.ts 的别名与插件，只追加覆盖率配置
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // 样式表默认会被清空；一致性测试需要用 ?raw 读到样式表原文
      css: { include: [/styles\/index\.css\?raw/] },
      coverage: coverageOptions({ statements: 50, branches: 48, functions: 46, lines: 51 }),
    },
  }),
);
