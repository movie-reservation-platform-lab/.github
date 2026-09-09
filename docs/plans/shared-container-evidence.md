# Implementation Plan: shared container evidence

## 1. Summary

Issue #12, a bounded implementation slice of #5 and #10: two SHA-pinned composite actions in this repository. This is security-sensitive cross-repository contract work.

## 2. Goals

Bring the five other runnable producers to the reservation-service evidence level without five copies of its tooling.

## 3. Non-goals

AWS admission/deployment, static-site OCI admission, OCI indexes, permanent vulnerability exceptions, migrating the working reservation-service pilot or PR-image scanning in this slice.

## 4. Current State

Reservation-service owns proven preparation, provenance verification, Trivy evaluation and v1alpha1 emission in automation/. The four runtime producers attest images but lack machine evidence. Web publishes a separate static artifact and an unattested ECS image. This repository previously had no executable shared actions.

## 5. Requirements and Assumptions

Canonical hosted GitHub push/main, existing job identities, single linux/amd64 image, bounded exact four-file evidence. Caller provides Node 24, git and gh. Open rollout questions: first live scan results, installation access for the environment evidence-reader App, and permanent policy under #8. Local checks cannot answer those.

## 6. Proposed Design

Pure allowlisted profile/context policy in actions/container-evidence/lib/profile.mjs. Named Node CLI adapters own git, gh and files. Composite YAML owns step order and pinned third-party actions. Producers own builds, contexts, gates and permissions; environments alone owns trust and AWS bindings. No framework or dependency installation in our privileged code.

## 7. Alternatives Considered

Copy pilot into every service: fast initial migration but divergent security fixes; rejected. Service-owned shared action: smaller extraction but wrong platform ownership; rejected. Reusable workflow: possible later, but changes signer/check boundaries now; composite calls preserve caller identity.

## 8. API / Interface Changes

prepare-container-candidate takes component and returns image_ref/tag. container-evidence takes component/digest/github-token. A closed ci.movie-platform.dev/v1alpha2 schema supports five profiles. workflow.job is the existing GitHub API job display name; GITHUB_JOB is separately checked against its YAML ID. Legacy v1alpha1 is unchanged and rejected by the new producer interface.

## 9. Data Model / Persistence Changes

Only new run/attempt-specific artifacts, retained 14 days. No retroactive evidence or rewriting older runs.

## 10. Security, Privacy, and Abuse Considerations

Reject forks, PRs, stale main, arbitrary components, malformed digests, existing evidence directories and symlinked evidence. Verify exact signer/source/ref/issuer/hosted runner. No arbitrary shell/path/signer inputs. Upload exactly four public evidence files, never workspace globs. Failed diagnostics have a distinct name and cannot be canonical evidence. Shared action authors have supply-chain authority: review and immutable consumption are required.

## 11. Performance, Scalability, and Reliability Considerations

Two bounded five-minute scans add publication time. No benchmark or throughput claim until actual runs. Serialize main publication without cancellation; retry uses a new attempt tag. A pushed image alone is ineligible. No retry silently weakens provenance or the CRITICAL gate.

## 12. Implementation Steps

1. Add closed profiles and preparation CLI; test canonical/stale context with fake git.
2. Extract pilot evaluator/emitter into dependency-free scripts; new contract and exact file hashes.
3. Compose pinned attestation/Trivy/upload actions; test negative emission and fake gh invocation.
4. Add CI, ownership and adoption/rollback docs; review security before producer pins.
5. Integrate five producers in independent issue-linked PRs; environment verification follows separately.

## 13. Testing Strategy

node --test test/*.test.mjs covers all profiles, invalid context, stale main, exact hashes, mismatched report, critical findings, malformed severity, symlinks, overwrite prevention and failed verification cleanup. No real registry/GitHub/AWS calls. Environment consumer additionally validates the schema, bundle and report contents independently. Live publication/admission remains a separate operator-approved acceptance step.

## 14. Rollout / Migration Plan

Merge shared implementation first; pin its reviewed full commit in producer PRs. Consumer must support v1alpha2 before attempting admission. Merge producers independently; record each successful new main run and attempt. Revert a consumer pin/workflow to roll back; old runs without evidence stay ineligible. Keep schema snapshots compatible with each supported producer version.

## 15. Risks and Mitigations

Scanner failures/CRITICALs may block publication: retain rejected diagnostics, do not bypass. Shared code compromise: full SHA pins, review and branch protection. Static/image confusion: separate job and profile. Private data leakage: no environment config, raw local records or credentials in this repository.

## 16. Done Criteria

Offline tests pass, workflows are pinned, public diff is sanitized, producer PR dependencies documented. Interface remains experimental until at least two canonical consumers and environment verification succeed.

## 17. Review Checklist

- [x] Explicit goals, non-goals, alternatives and ownership.
- [x] Failure, security, compatibility and rollback rules.
- [x] Offline executable tests.
- [x] Independent review completed; subprocess diagnostic leakage and missing schema validation fixed with regression tests.
- [ ] Two live producers accepted; not part of PR-only preparation.

## 18. Handoff Prompt for Implementation Agent

Implement this plan using actions/, contracts/ and test/ only plus documentation/CI. Preserve v1alpha1 and runtime behavior. Run node --test test/*.test.mjs and git diff --check. Do not dispatch publication or admission, install credentials, or add AWS identifiers. If observations contradict a trust assumption, update this plan before broadening support.
