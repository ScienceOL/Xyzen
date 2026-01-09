/**
 * Vitest test setup file
 *
 * This file runs before each test file and sets up the testing environment.
 */

import { vi, beforeEach } from "vitest";

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] || null;
  },
  setItem(key: string, value: string) {
    this.store[key] = value;
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
  get length() {
    return Object.keys(this.store).length;
  },
  key(index: number) {
    return Object.keys(this.store)[index] || null;
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
});

// Mock window.location
Object.defineProperty(globalThis, "location", {
  value: {
    protocol: "http:",
    host: "localhost:3000",
    hostname: "localhost",
    port: "3000",
    pathname: "/",
    search: "",
    hash: "",
    href: "http://localhost:3000/",
  },
  writable: true,
});

// Mock crypto.randomUUID
Object.defineProperty(globalThis, "crypto", {
  value: {
    randomUUID: () => "test-uuid-" + Math.random().toString(36).slice(2, 11),
  },
});

// Reset mocks before each test
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});
