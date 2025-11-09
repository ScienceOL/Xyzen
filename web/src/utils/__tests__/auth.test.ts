import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_KEY,
  extractCookieValue,
  syncTokenFromCookie,
} from "../auth";

// In-memory storage mock
class MemoryStorage implements Pick<Storage, "getItem" | "setItem"> {
  private data: Record<string, string> = {};
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(this.data, key)
      ? this.data[key]
      : null;
  }
  setItem(key: string, value: string) {
    this.data[key] = value;
  }
}

describe("extractCookieValue", () => {
  it("returns null for empty cookie string", () => {
    expect(extractCookieValue("token", "")).toBeNull();
  });
  it("extracts value when present", () => {
    const cookie = "a=1; token=abc123; c=zzz";
    expect(extractCookieValue("token", cookie)).toBe("abc123");
  });
  it("decodes encoded value", () => {
    const cookie = "token=" + encodeURIComponent("hello world");
    expect(extractCookieValue("token", cookie)).toBe("hello world");
  });
  it("returns null when missing", () => {
    const cookie = "a=1; b=2";
    expect(extractCookieValue("token", cookie)).toBeNull();
  });
});

describe("syncTokenFromCookie", () => {
  it("synchronizes token when storage empty", () => {
    const storage = new MemoryStorage();
    const cookie = "appAccessKey=abc";
    const token = syncTokenFromCookie("appAccessKey", {
      storage,
      cookieString: cookie,
    });
    expect(token).toBe("abc");
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBe("abc");
  });
  it("returns existing token when present and allowExisting", () => {
    const storage = new MemoryStorage();
    storage.setItem(ACCESS_TOKEN_KEY, "existing");
    const cookie = "appAccessKey=newOne";
    const token = syncTokenFromCookie("appAccessKey", {
      storage,
      cookieString: cookie,
      allowExisting: true,
    });
    expect(token).toBe("existing");
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBe("existing");
  });
  it("does not override existing token when allowExisting=false", () => {
    const storage = new MemoryStorage();
    storage.setItem(ACCESS_TOKEN_KEY, "existing");
    const cookie = "appAccessKey=newOne";
    const token = syncTokenFromCookie("appAccessKey", {
      storage,
      cookieString: cookie,
      allowExisting: false,
    });
    expect(token).toBeNull();
    expect(storage.getItem(ACCESS_TOKEN_KEY)).toBe("existing");
  });
  it("returns null when cookie token missing", () => {
    const storage = new MemoryStorage();
    const cookie = "a=1; b=2";
    const token = syncTokenFromCookie("appAccessKey", {
      storage,
      cookieString: cookie,
    });
    expect(token).toBeNull();
  });
});
