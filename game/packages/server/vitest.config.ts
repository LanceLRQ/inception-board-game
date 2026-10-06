import { defineConfig } from 'vitest/config';
import { testOptions } from '../../vitest.shared';

export default defineConfig({
  test: testOptions({ statements: 85, branches: 82, functions: 81, lines: 86 }),
});
