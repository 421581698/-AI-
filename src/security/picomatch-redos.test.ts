import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type Pico = {
  isMatch(input: string, pattern: string, options?: Record<string, unknown>): boolean;
  makeRe(pattern: string, options?: Record<string, unknown>): RegExp;
};
const picomatch = require("picomatch") as Pico;

describe("maintained picomatch ReDoS safeguards", () => {
  it("literalizes known catastrophic repeated wildcard patterns", () => {
    const patterns = ["+(*)", "+(*a)", "*(*a)", "+(*a|b)", "*(a*|b)"];
    for (const pattern of patterns) {
      expect(picomatch.isMatch(pattern, pattern), pattern).toBe(true);
      expect(picomatch.isMatch("a".repeat(80) + "!", pattern), pattern).toBe(false);
    }
  });

  it("blocks repeated multi-character prefix overlap", () => {
    for (const pattern of ["+(ab|abab)", "*(ab|abab)", "+(abc|abcabc)"]) {
      expect(picomatch.isMatch(pattern, pattern), pattern).toBe(true);
      expect(picomatch.isMatch("ab".repeat(80) + "!", pattern), pattern).toBe(false);
    }
  });

  it("preserves common non-ambiguous extglobs", () => {
    expect(picomatch.isMatch("jsx", "+(js|jsx)")).toBe(true);
    expect(picomatch.isMatch("foo", "+(foo|bar)")).toBe(true);
    expect(picomatch.isMatch("barfoo", "*(foo|bar)")).toBe(true);
    expect(picomatch.isMatch("app.js", "*.+(js|jsx)")).toBe(true);
  });

  it("finishes hostile cases in an isolated process within a deadline", () => {
    const modulePath = require.resolve("picomatch");
    const script = `
      const pm = require(${JSON.stringify(modulePath)});
      const patterns = ["+(*)", "+(*a)", "*(*a)", "+(*a|b)", "*(a*|b)", "+(ab|abab)"];
      for (const pattern of patterns) {
        const input = pattern.includes("ab|") ? "ab".repeat(100) + "!" : "a".repeat(100) + "!";
        if (pm.isMatch(input, pattern)) process.exit(1);
      }
    `;
    const { spawnSync } = require("node:child_process");
    const result = spawnSync(process.execPath, ["-e", script], { timeout: 1500 });
    expect(result.error, String(result.error)).toBeUndefined();
    expect(result.status).toBe(0);
  });

  it("retains the explicit safeguard opt-out", () => {
    expect(picomatch.makeRe("+(*a)", { maxExtglobRecursion: false }).source).toMatch(/\)\+/);
  });
});
