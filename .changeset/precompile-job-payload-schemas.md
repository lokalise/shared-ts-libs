---
"@lokalise/background-jobs-common": major
---

Precompile registered job payload schemas and require `zod` >= 4.5.0.

The `jobPayloadSchema` of every `QueueConfiguration` is now compiled ahead of time when the configuration is
registered, so payload validation in `QueueManager`, `FlowManager` and the job processors takes zod's generated
fast path instead of the interpreted parser. A schema zod refuses to compile (an async refinement or a recursive
schema) keeps using the regular parser.

Three consequences to be aware of:

- The `zod` peer range moves from `>=3.25.67` to `>=4.5.0 <5.0.0`, since 4.5 is where `z.compile` landed.
- Parse results are unchanged, but the fast path only signals that input is invalid, so zod re-runs the original
  parser to build the error. A synchronous `refine`, `superRefine` or `transform` therefore runs twice for a payload
  that fails validation, which is observable when such a callback has a side effect outside the parse.
  `z.config({ jitless: true })` turns precompilation off.
- `getQueueConfig()` returns a shallow copy of the registered configuration carrying the compiled schema, not the
  object that was passed in. The config and schema you registered are left untouched, and the compiled schema is
  absent from any zod registry the original was added to.
