# Container candidate actions (experimental)

Owned by the organization CI maintainers under [#5](https://github.com/movie-reservation-platform-lab/.github/issues/5) and [#12](https://github.com/movie-reservation-platform-lab/.github/issues/12). The known-good reservation-service pilot remains unchanged.

Use both actions by **the same reviewed full commit SHA**:

```yaml
- id: candidate
  uses: movie-reservation-platform-lab/.github/actions/prepare-container-candidate@<full-reviewed-commit>
  with:
    component: recommendation-service
# Caller builds and pushes one linux/amd64 manifest with provenance: false,
# tags: ${{ steps.candidate.outputs.image_ref }}:${{ steps.candidate.outputs.tag }}
- uses: movie-reservation-platform-lab/.github/actions/container-evidence@<same-full-reviewed-commit>
  with:
    component: recommendation-service
    digest: ${{ steps.build.outputs.digest }}
    github-token: ${{ github.token }}
```

Caller obligations: Node 24, git, gh, Docker; canonical repository push/main guard; main publication must not be cancelled by concurrency; checkout persist-credentials:false; existing quality/smoke gates; contents:read, packages:write, id-token:write, attestations:write only in the publishing job. Do not install application dependencies in that privileged job.

Supported components: reservation-agent, recommendation-service, reservation-mcp, recommendation-mcp and **reservation-web ECS image only**. Profiles bind repository, workflow and job; arbitrary artifacts/signer workflows are not inputs. Source/build labels remain caller-owned. The API job display name is recorded in workflow.job and checked separately from the YAML job ID at publication.

The output is `<component>-security-evidence-<runId>-attempt-<attempt>`, four exact files following [v1alpha2](../contracts/component-candidate-evidence-v1alpha2.schema.json). Files are rooted directly in the downloaded artifact; document paths include the producer's security-evidence/ prefix. Image provenance and package provenance are both required. The digest must identify a single runnable manifest, not an OCI index or web static bundle.

CRITICAL findings fail; HIGH findings are exposed for explicit downstream approval under provisional [policy #8](https://github.com/movie-reservation-platform-lab/.github/issues/8). A failed run or rejected-diagnostics artifact is never admission evidence. Publication success does not mean selected, admitted to AWS, deployed, or behaviorally tested at that exact digest.

Local tests: `npm ci --ignore-scripts && npm test` (Node 24). Ajv is development-only, for emitted-document/schema compatibility tests; publisher jobs never install these dependencies. Fake git/gh adapters keep tests offline; Trivy, OIDC and real canonical publication need separate live acceptance. Runner-provided gh is used in producer verification as in the pilot; the environment verifier independently uses its pinned CLI. This does not make producer runner tools immutable.

Versioning: review changes here, run tests, merge, then open consumer pin PRs. Never consume main/tags or silently rewrite an existing schema contract. In emergencies revert affected consumer pins; do not bypass validation. Existing artifacts expire after 14 days: new runs are required, not reconstructed evidence.

Repository administrators should require reviewed PRs/status checks and CODEOWNERS review for actions/, contracts/ and .github/workflows/. No branch protection or organization settings are changed by this PR. Shared code executes with caller write permissions; review it as supply-chain code.

See [plan](plans/shared-container-evidence.md), [GitHub attestation verification](https://cli.github.com/manual/gh_attestation_verify) and [composite metadata](https://docs.github.com/en/actions/reference/workflows-and-actions/metadata-syntax).
