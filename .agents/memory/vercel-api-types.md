---
name: Vercel API ambient types
description: TypeScript ambient globals for Vercel API handlers imported from the nested app directory.
---

When a root-level Vercel API entry imports its implementation from `.migration-backup`, Vercel may type-check the imported file without inheriting the nested API tsconfig. If it reports missing `Request`, `Response`, `fetch`, or `process`, add `/// <reference lib="dom" />` and `/// <reference types="node" />` to the imported handler source, where the nested package can resolve `@types/node`.

**Why:** the shared root TypeScript config intentionally limits ambient types, so broadening it can affect unrelated workspace packages.

**How to apply:** verify both the nested API tsconfig and the root Vercel entry importing the handler, then run a TypeScript check on that root entry plus the full Vercel build.
