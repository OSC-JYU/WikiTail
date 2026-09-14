import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Repositories open SQLite at import time, so each test file needs its own
    // database file; tests that touch the DB set DB_PATH before importing.
    pool: 'forks',
  },
});
