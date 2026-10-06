import { defineConfig } from 'vitest/config';
import { testOptions } from '../../vitest.shared';

export default defineConfig({
  test: testOptions({ statements: 88, branches: 83, functions: 82, lines: 90 }),
});
