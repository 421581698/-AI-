# Maintained picomatch security fork

This package vendors the MIT-licensed picomatch 4.0.7 source and applies the community-proposed repeated-extglob safeguards from picomatch PR #258.

- Upstream base: `micromatch/picomatch` tag `4.0.7`
- Patch source: `lailavinson/picomatch` commit `578a87fae0ffd1f2e5420ff4d52135eb9210d169`
- Upstream PR: https://github.com/micromatch/picomatch/pull/258
- Local package version: `4.0.8`

This is an independently maintained downstream patch, not an official picomatch release and not an upstream-merged fix. Keep the regression tests in `src/security/picomatch-redos.test.ts` and review this fork when updating the upstream dependency.
