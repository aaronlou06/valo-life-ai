---
name: Orval hook query options require queryKey
description: Passing query options (enabled/retry) to a generated useGet* hook fails typecheck unless you also pass queryKey.
---

The orval-generated `useGet*` hooks in `@workspace/api-client-react` type their `query`
option as a full `UseQueryOptions` (not `Partial`), so TypeScript requires `queryKey`.

**Rule:** when you pass any query option (e.g. `enabled`, `retry`) to a generated query
hook, you MUST also pass `queryKey`, using the co-generated key getter.

```ts
import { useGetWeeklyRecapById, getGetWeeklyRecapByIdQueryKey } from "@workspace/api-client-react";

useGetWeeklyRecapById(id, {
  query: { enabled: Number.isFinite(id), queryKey: getGetWeeklyRecapByIdQueryKey(id) },
});
```

**Why:** without it, `tsc` errors `TS2741: Property 'queryKey' is missing`. The key getters
(`getGet<Name>QueryKey`) are re-exported through the barrel (`export * from "./generated/api"`).

**How to apply:** any time you need `enabled`/`retry`/etc. on a generated query hook in the
Valo mobile app (or any artifact consuming this client), import and call the matching key getter.
