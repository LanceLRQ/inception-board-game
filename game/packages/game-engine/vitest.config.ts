import { defineConfig } from 'vitest/config';
import { testOptions } from '../../vitest.shared';

export default defineConfig({
  test: testOptions({ statements: 90, branches: 86, functions: 93, lines: 94 }),
});
