# How the SSE fallback works

A plain-language companion to the [Resilient live data](../README.md#resilient-live-data--sse-with-a-polling-fallback)
section of the README. That section is the reference: every option, every guarantee, every error.
This one is the mental model: what the moving parts are, and what happens to a single event on its
way from the server to your callback.

## The problem

A push channel can stop delivering without telling anyone. A connection dies with no error event,
a proxy kills a stream it thinks is idle, a room rebalance drops a message. Application code that
is waiting for "upload finished" then waits forever, and the only fix the user knows is a reload.

## The idea

**Poll for correctness, stream for latency.** A poll of the same route returns the full current
state, so it can always answer "what is true right now". The stream just makes the answer arrive
sooner. Both channels feed one version gate, so the subscription delivers each event once and your
code never learns which channel it came from.

## Who does what

| Layer | Lives in | Owns |
|---|---|---|
| Your code | your app | asks for events, waits for a terminal one |
| Contract | `@lokalise/api-contracts` | the shape of both branches: a JSON schema for the poll, `sseResponse` schemas for the stream |
| Binding | your app, one per contract | the one thing nothing can infer: how a snapshot relates to events (`snapshotToEvents`, `version.ofSnapshot`, `terminalEvents`) |
| Client core | `@opinionated-machine/sse-fallback` | timing and truth: hydration, deadman timer, version gate, reconnect, degradation, budgets |
| Transport | this package, `createFallbackTransport` | HTTP: `Accept` negotiation, fresh headers, `Last-Event-ID`, byte decoding, Zod validation |

The core owns no HTTP and this package owns no policy. That split is the whole design: the seam
between them is two functions, `fetchSnapshot` and `openStream`.

## The big picture

```mermaid
flowchart TB
    app["Your code<br/>one uniform event stream"]
    core["Client core: createResilientSubscription<br/>version gate · deadman timer · reconnect<br/>degradation · budgets"]
    transport["This package: createFallbackTransport<br/>contracts · headers · validation"]
    poll["fetchSnapshot<br/>Accept: application/json"]
    stream["openStream<br/>Accept: text/event-stream"]
    server["One route, two representations"]

    app -->|"waitFor, onEvent, getState"| core
    core -->|"FallbackTransport seam"| transport
    transport --> poll
    transport --> stream
    poll -->|"full current state and version"| server
    stream -->|"low-latency deltas"| server
```

In words: your code talks to one subscription object. The subscription decides *when* to poll and
*when* to reconnect. This package decides *how* those two requests are made, and refuses anything
it cannot trust.

## One subscription, start to finish

```mermaid
sequenceDiagram
    autonumber
    participant App as Your code
    participant Core as Client core
    participant T as Transport
    participant S as Server

    App->>Core: createResilientSubscription(binding, opts)
    par Hydration
        Core->>T: fetchSnapshot
        T->>S: GET, Accept application/json, no-cache
        S-->>T: 200, version 1, status pending
        T->>T: validate against the contract schema
        T-->>Core: snapshot
    and Live channel
        Core->>T: openStream
        T->>S: GET, Accept text/event-stream
        S-->>T: 200 text/event-stream
        T-->>Core: async iterable of text chunks
    end
    Note over Core: watermark = 1

    S-->>T: heartbeat comment
    T-->>Core: bytes, so the connection is demonstrably alive

    S-->>T: id 7, event uploadFinished, version 7
    T-->>Core: chunk forwarded, payload checked on the side
    Core->>Core: 7 is above 1, accept and raise the watermark
    Core-->>App: uploadFinished

    Note over Core,App: terminal event, the subscription resolves
```

In words: the subscription hydrates and connects at the same time, so it has state even if the
stream never opens. Every accepted event raises a watermark. A terminal event ends the whole
thing.

When the stream goes quiet, the deadman timer takes over:

```mermaid
sequenceDiagram
    autonumber
    participant Core as Client core
    participant T as Transport
    participant S as Server

    Note over Core: watermark = 1, stream connected and heartbeating
    Note over Core: no event for deadmanDelayMs
    Core->>T: fetchSnapshot, the repair poll
    T->>S: GET, Accept application/json
    S-->>T: 200, version 2, status completed
    T-->>Core: snapshot
    Core->>Core: 2 is above 1, so the stream missed something
    Core->>Core: snapshotToEvents rebuilds the missing event
    Core-->>Core: deliver uploadFinished, watermark = 2
```

That poll is the point of the whole library. The stream stayed up, kept sending heartbeats, and
simply never delivered the event. Polling caught it anyway.

## From bytes to an event your code sees

```mermaid
flowchart TB
    body["Response body<br/>byte chunks"]
    decode["readTextChunks<br/>manual reader plus TextDecoder"]
    mode{"streamMode"}

    inspect["inspectChunks<br/>frame on the side, forward the chunk untouched"]
    frame["frameChunks<br/>SseFramer emits frames"]

    validateA["validate the payload<br/>report to diagnostics"]
    validateB["validate the payload<br/>report, and with 'drop' end the stream"]

    coreparse["Core frames the raw text itself<br/>heartbeats count as liveness"]
    gate{"Version gate<br/>compare against the watermark"}
    app["Your callback"]
    dedupe["Dropped as a duplicate"]

    body --> decode --> mode
    mode -->|"'chunks', the default"| inspect
    mode -->|"'events'"| frame
    inspect --> validateA --> coreparse --> gate
    frame --> validateB --> gate
    gate -->|"newer"| app
    gate -->|"at or below the watermark"| dedupe
```

In words: the transport always reads the socket itself, because two things the core needs are
destroyed by framing that happens too early. Heartbeat comments are liveness evidence, and the
per-frame `id:` is what the version gate reads. In the default `'chunks'` mode the transport
therefore hands the core the exact bytes it received and validates on the side. In `'events'` mode
it hands over parsed frames, which is what makes withholding a bad one possible.

## The framer, line by line

`SseFramer` is the incremental parser behind both modes, and it is exported if you need it
directly. It follows the WHATWG event-stream rules:

```mermaid
flowchart TB
    chunk["Text chunk appended to the buffer"]
    split["Split on CR, LF or CRLF<br/>a trailing CR is held back for the next chunk"]
    line{"What is this line?"}

    blank["Empty: dispatch the frame"]
    comment["Starts with a colon: a comment, ignored<br/>but still bytes on the wire"]
    field["field then colon then value<br/>one leading space stripped"]

    which{"Which field?"}
    data["data: appended to the data buffer"]
    event["event: sets the type<br/>an empty value means 'message'"]
    id["id: moves the sticky cursor<br/>a value containing NUL is ignored"]
    retry["retry: digits only, held for the next dispatch"]
    other["Anything else: ignored"]

    hasdata{"Did the frame carry data?"}
    emit["Emit a frame<br/>id, event, data, retry, lastEventId"]
    nothing["Emit nothing<br/>the cursor still moved"]

    chunk --> split --> line
    line --> blank
    line --> comment
    line --> field
    field --> which
    which --> data
    which --> event
    which --> id
    which --> retry
    which --> other
    blank --> hasdata
    hasdata -->|"yes"| emit
    hasdata -->|"no"| nothing
```

Two details carry most of the weight. The reconnect cursor advances only when a frame is
dispatched, so a frame the connection cut off mid-way cannot make a reconnect skip past the event
it was carrying. And the per-frame `id:` is reported separately from the sticky cursor, because the
core's default version extractor reads the frame's own id: hand it the cursor instead and every
id-less frame looks like a repeat of the previous version.

## When things break

```mermaid
stateDiagram-v2
    [*] --> Hydrating
    Hydrating --> Live: stream opened
    Hydrating --> Reconnecting: connect refused or failed
    Live --> Repairing: deadman timer fired
    Repairing --> Live: snapshot answered
    Live --> Reconnecting: stream ended, died, or sent no bytes in time
    Reconnecting --> Live: connect succeeded, resumed from the cursor
    Reconnecting --> Degraded: connects keep failing
    Degraded --> Degraded: poll every degradedPollIntervalMs
    Degraded --> Live: a later connect succeeds
    Live --> [*]: terminal event, budget spent, or stop
    Degraded --> [*]: terminal event, budget spent, or stop
```

In words: the stream is allowed to fail. Losing it costs latency, not correctness, because the
polling backbone keeps the subscription answering. The thresholds and backoffs are core policy
(`sseRetryBackoff`, `deadmanDelayMs`, `degradedPollIntervalMs`, `staleConnectionTimeoutMs`,
`subscriptionBudget`). The transport contributes no timers of its own and imposes no deadlines,
so every wait stays bounded by the signal the core passes in.

`policy.mode: 'poll-only'` pins the machine to the polling side on purpose. That is how you adopt
the fallback before an SSE endpoint exists: same binding, same version gate, same state, and
turning the stream on later is a config change rather than a second migration.

## What each failure does

The rule the core relies on: a refusal is a result, and only something genuinely unusable is a
rejection.

```mermaid
flowchart TB
    outcome{"What came back?"}
    net["Network failure,<br/>unsupported method"]
    non2xx["Non-2xx status"]
    bad["A snapshot that cannot be trusted:<br/>schema violation, undeclared content type,<br/>an SSE body, binary, empty, invalid JSON"]
    okpoll["A valid snapshot"]
    badevent["An SSE payload that fails its schema"]
    unknown["An SSE event the contract<br/>does not declare"]

    reject["Reject<br/>the core counts a channel failure and backs off"]
    resolve["Resolve, carrying the status<br/>the core applies unretryableStatuses<br/>or calls onAuthChallenge"]
    deliver["Deliver to the version gate"]
    report["Report to diagnostics.onEventSchemaError"]
    dropped["'drop': withhold it and end the stream<br/>'report': deliver it anyway"]
    counted["Report to diagnostics.onUndeclaredEvent,<br/>then deliver"]

    outcome --> net --> reject
    outcome --> non2xx --> resolve
    outcome --> bad --> reject
    outcome --> okpoll --> deliver
    outcome --> badevent --> report --> dropped
    outcome --> unknown --> counted
```

In words: a 401 has to reach the core, because the core is the thing that can refresh a token and
retry. A snapshot that violates its schema must never reach the core, because a wrong version
poisons the watermark and silently drops every later event. A failed poll is recoverable; a
poisoned watermark is not.

## Why `'drop'` ends the stream

With `eventValidation: 'drop'`, withholding the bad frame is only half the job. Ending the
connection is the other half:

```mermaid
sequenceDiagram
    autonumber
    participant S as Server
    participant T as Transport
    participant Core as Client core

    Note over Core: watermark = 1
    S-->>T: id 2, progress, percent "half", which the schema rejects
    T->>T: report to onEventSchemaError
    T-->>Core: end of stream, the frame withheld
    Note over Core: watermark still 1, below the hole
    Core->>T: reconnect from the cursor it still holds, plus a repair poll
    T-->>Core: snapshot version 3
    Note over Core: 3 is above 1, so the snapshot applies and rebuilds the gap
```

Had the transport withheld frame 2 and kept going, the next valid frame would have pushed the
watermark past the hole. The repair poll would then land at or below the watermark, where the
reconciler reads it as a stale duplicate and synthesizes nothing, so the withheld event would be
lost for good. The cost of ending the stream instead is one reconnect per rejected payload, which
is proportionate: a stream emitting bodies its own contract rejects is broken, and polling carries
the subscription meanwhile.

## Glossary

| Term | Meaning |
|---|---|
| Snapshot | The JSON body of a poll: full current state plus a version |
| Frame | One SSE event block, terminated by a blank line |
| Watermark | The highest version the subscription has accepted |
| Version gate | The check that compares an incoming version against the watermark, so each event is delivered once |
| Hydration | The first poll, which gives the subscription its initial state and its first watermark |
| Deadman timer | No *events* for `deadmanDelayMs`, so poll to find out what was missed |
| Stale-connection watchdog | No *bytes* for `staleConnectionTimeoutMs`, so the connection is presumed dead and gets reconnected |
| Cursor, `Last-Event-ID` | The id of the last dispatched frame, sent on reconnect so a server can replay from there |
| Degradation | The core giving up on the stream for a while and polling on an interval instead |
| Terminal event | An event that completes the subscription, as declared by the binding |
| Repair poll | A poll fired to close a gap the stream left |

## Picking the modes

| You want | Use |
|---|---|
| The default, which is the right answer almost always | `streamMode: 'chunks'` with `eventValidation: 'report'` |
| To adopt the fallback before an SSE endpoint exists | Any contract with a JSON branch, plus the core's `policy.mode: 'poll-only'` |
| A payload the contract rejects to never reach app code | `streamMode: 'events'` with `eventValidation: 'drop'`, accepting one reconnect per bad payload and an event-level liveness watchdog |
| No validation at all | `eventValidation: 'off'`, or no contract |
