# Contributing to shared-ts-libs

## Rules

There are a few basic ground-rules for contributors:

1. **Non-main branches** ought to be used for ongoing work.
2. Contributors should attempt to adhere to the prevailing code-style.
3. Before submitting a PR for a major new feature, or introducing a significant change, please open an issue to discuss the proposal with maintainers.

## Changesets

This repo uses [Changesets](https://github.com/changesets/changesets) to automate versioning and releases.

If your PR affects anything used by consumers (API, types, runtime behavior, or usage-facing docs), add a changeset by running: `pnpm changeset`.

The command will prompt you to select affected packages, choose the change type (`major`, `minor`, or `patch`) for each, and a description of the change.
It will generate a file in `.changeset/` that you should commit.
You can edit the generated file to improve the release note if needed.

> **Note:** If you add headers inside a changeset, use `####` or `#####` only. Shallower headers will break the final CHANGELOG and upstream tooling.

**Choose the correct bump type:**

- `patch` — bug fixes
- `minor` — new features, backwards-compatible
- `major` — breaking changes

**Writing a good description:**

- Focus on user-facing impact; skip implementation details
- Keep it to 1–3 sentences
- Use past tense for what you did ("Added support for X") and present tense for package behavior ("The processor now handles Y")

## Releases

Releases are triggered automatically when a PR with a changeset is merged to `main`.
Do not bump version numbers manually — versioning is handled by the release pipeline.

## Developer's Certificate of Origin 1.1

By making a contribution to this project, I certify that:

- (a) The contribution was created in whole or in part by me and I have the
  right to submit it under the open source license indicated in the file; or

- (b) The contribution is based upon previous work that, to the best of my
  knowledge, is covered under an appropriate open source license and I have the
  right under that license to submit that work with modifications, whether
  created in whole or in part by me, under the same open source license (unless
  I am permitted to submit under a different license), as indicated in the file;
  or

- (c) The contribution was provided directly to me by some other person who
  certified (a), (b) or (c) and I have not modified it.

- (d) I understand and agree that this project and the contribution are public
  and that a record of the contribution (including all personal information I
  submit with it, including my sign-off) is maintained indefinitely and may be
  redistributed consistent with this project or the open source license(s)
  involved.
