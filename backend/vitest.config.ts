import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // 支持两种测试文件组织方式:
    // 1. src/__tests__/**/*.test.ts - 传统集中式
    // 2. src/**/*.test.ts - 同目录放置（新规范）
    include: [
      'src/__tests__/**/*.test.ts',
      'src/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
    ],
    testTimeout: 10000,
  },
});
