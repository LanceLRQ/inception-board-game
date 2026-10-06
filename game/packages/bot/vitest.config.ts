import { defineConfig } from 'vitest/config';
import { testOptions } from '../../vitest.shared';

export default defineConfig({
  test: testOptions({ statements: 90, branches: 80, functions: 89, lines: 91 }),
});
