---
name: OpenAPI query generation
description: Work around duplicate generated parameter types for GET operations that combine path and query parameters.
---

When the current OpenAPI code generator emits duplicate `*Params` types for a GET operation with both path and query parameters, put cursor pagination in the path and move complex message search criteria into a POST JSON body. Keep the OpenAPI contract and server validation aligned with those routes.

**Why:** A duplicate generated type caused API client generation to fail for chat pagination and search.

**How to apply:** Use path parameters for opaque cursors and POST bodies for structured search when GET parameter composition triggers duplicate generated types; rerun code generation and library type checks.
