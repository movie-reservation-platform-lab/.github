# Plan: public SRE candidate pack

Issue: [#16](https://github.com/movie-reservation-platform-lab/.github/issues/16).
Coordination: [#15](https://github.com/movie-reservation-platform-lab/.github/issues/15).

## Goal and boundary

Create `docs/sre-interview/README.md` with accurate request/deployment and telemetry
diagrams, public source entrypoints and an investigation-only workflow. The
facilitator supplies the actual release, exercise time window and entry URLs.
This document must not disclose operator triggers, reset instructions, scoring,
secrets, account/workspace identifiers or private repository material.

## Evidence and design

The public infra source defines six applications plus ADOT and FireLens in one
Fargate task. The agent calls recommendation and reservation capabilities through
their MCP wrappers. Reservation state is in-memory in this demo profile.
Existing telemetry routes to AMP, X-Ray and CloudWatch. Optional private Tempo is
a separate ephemeral task, not a deployed guarantee. Audit routing through
Firehose/S3 is separate from operational telemetry and is not Security Lake.

Use two Mermaid diagrams with explicit boundaries and optional/dashed arrows.
Keep the handout concise and refer to pinned public source, not unpinned latest
code as proof of the deployed release. Add `docs/README.md` navigation without
changing the already-dirty organization profile or importing untracked AI files.

## Checks, rollout and rollback

- Inspect public source paths and revisions; distinguish inspected baseline from
  the release actually selected by the facilitator.
- Render both Mermaid diagrams locally if tooling is available.
- Inspect the diff for sensitive identifiers, private-repository links and
  answer-key material; verify links and relative navigation.
- Commit/push one `[ai]` PR, no merge or AWS/Grafana changes.
- Before use, facilitator confirms real data sources and replaces unavailable
  optional capabilities with the declared fallback. Rollback is reverting docs.

No repository `AGENTS.md` or `.codex` exists on main. The original checkout's
untracked hybrid-teaching skill was inspected and does not apply to this explicitly
delegated implementation. Its files and modified profile are preserved untouched.
