import { beforeAll, afterAll } from "vitest";

beforeAll(() => {
  // Set test environment defaults
  process.env.NODE_ENV = "test";
  process.env.LOG_LEVEL = "silent";
});

afterAll(() => {
  // Cleanup if needed
});
