---
"@lokalise/background-jobs-common": major
---

Precompile registered job payload schemas and require `zod` >= 4.5.0.

The `jobPayloadSchema` of every `QueueConfiguration` is now compiled ahead of time when the configuration is
registered, so payload validation in `QueueManager`, `FlowManager` and the job processors takes zod's generated
fast path instead of the interpreted parser. Parsing behavior is unchanged; a schema zod cannot compile keeps
using the regular parser.

Three consequences to be aware of:

- The `zod` peer range moves from `>=3.25.67` to `>=4.5.0 <5.0.0`, since 4.5 is where `z.compile` landed.
- Passing an already precompiled schema as a `jobPayloadSchema` is a type error, because the library compiles
  what it is given.
- `getQueueConfig()` returns a shallow copy of the registered configuration carrying the compiled schema, not the
  object that was passed in. The config and schema you registered are left untouched.

Adds `precompileSchema`, `isPrecompiledSchema`, and the `PrecompiledSchema` / `NonPrecompiledSchema` types to the
public API.
