// 各包共用的测试配置
//
// 覆盖率只统计被测试加载到的源文件，所以阈值的作用是防止已有覆盖倒退，不代表整体覆盖水平。
// 阈值定在当前实测值下方几个百分点；补了测试之后可以把对应包的阈值往上调。

import type { ViteUserConfig } from 'vitest/config';

export interface CoverageThresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

type TestOptions = NonNullable<ViteUserConfig['test']>;

export function coverageOptions(
  thresholds: CoverageThresholds,
): NonNullable<TestOptions['coverage']> {
  return {
    provider: 'v8',
    reporter: ['text-summary', 'json-summary', 'html'],
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/generated/**', 'src/testing/**', 'src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
    thresholds,
  };
}

/** 只跑 src 下的测试：构建产物 dist 里有编译出来的测试文件，不限定会被重复执行 */
export function testOptions(thresholds: CoverageThresholds): TestOptions {
  return {
    globals: true,
    include: ['src/**/*.test.ts'],
    coverage: coverageOptions(thresholds),
  };
}
