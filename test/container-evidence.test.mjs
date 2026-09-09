import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  publicationContext,
  profileFor,
  requireDigest,
} from "../actions/container-evidence/lib/profile.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const scripts = join(root, "actions/container-evidence/lib");
const ajv = new Ajv({ strict: false });
addFormats(ajv);
const validate = ajv.compile(
  JSON.parse(
    readFileSync(
      join(root, "contracts/component-candidate-evidence-v1alpha2.schema.json"),
    ),
  ),
);
const components = [
  "reservation-web",
  "reservation-agent",
  "recommendation-service",
  "reservation-mcp",
  "recommendation-mcp",
];
const digest = `sha256:${"a".repeat(64)}`;
function environment(component = "reservation-agent") {
  const profile = profileFor(component);
  return {
    ...process.env,
    COMPONENT: component,
    GITHUB_REPOSITORY: profile.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_JOB: profile.jobId,
    GITHUB_SHA: "b".repeat(40),
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "2",
    CANDIDATE_DIGEST: digest,
    CANDIDATE_REPOSITORY: profile.image,
    ATTESTATION_ID: "456",
    ATTESTATION_URL: `https://github.com/${profile.repository}/attestations/456`,
  };
}
function fixture(t, component) {
  const directory = mkdtempSync(join(tmpdir(), "container-evidence-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const env = {
    ...environment(component),
    GITHUB_WORKSPACE: directory,
    GITHUB_OUTPUT: join(directory, "output"),
    GITHUB_STEP_SUMMARY: join(directory, "summary"),
  };
  const profile = profileFor(env.COMPONENT);
  mkdirSync(join(directory, "security-evidence"));
  const report = {
    SchemaVersion: 2,
    ArtifactType: "container_image",
    ArtifactName: `${profile.image}@${digest}`,
    Results: [],
  };
  const put = (name, value) =>
    writeFileSync(
      join(directory, "security-evidence", name),
      JSON.stringify(value),
    );
  put(profile.provenance, {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
  });
  put(profile.sbom, { bomFormat: "CycloneDX", specVersion: "1.6", version: 1 });
  put(profile.vulnerabilities, report);
  return {
    directory,
    env,
    profile,
    report,
    put,
    run: (script) =>
      spawnSync(process.execPath, [join(scripts, script)], {
        env,
        encoding: "utf8",
        cwd: tmpdir(),
      }),
  };
}

for (const component of components) {
  test(`${component}: emits exact run, digest, job and hashed four-file profile independent of cwd`, (t) => {
    const f = fixture(t, component);
    const result = f.run("emit.mjs");
    assert.equal(result.status, 0, result.stderr);
    const doc = JSON.parse(
      readFileSync(join(f.directory, "security-evidence", f.profile.document)),
    );
    assert.equal(validate(doc), true, JSON.stringify(validate.errors));
    for (const mutate of [
      (d) => {
        d.source.repository = "attacker/image";
      },
      (d) => {
        d.workflow.job = "publish-static-artifact";
      },
      (d) => {
        d.securityEvidence.sbom.path =
          "security-evidence/reservation-service.cdx.json";
      },
      (d) => {
        d.component = "reservation-service";
      },
      (d) => {
        d.apiVersion = "ci.movie-platform.dev/v1alpha1";
      },
      (d) => {
        d.candidate.platform.architecture = "arm64";
      },
    ]) {
      const invalid = structuredClone(doc);
      mutate(invalid);
      assert.equal(
        validate(invalid),
        false,
        "schema must reject mixed or unsupported identity",
      );
    }
    assert.equal(doc.apiVersion, "ci.movie-platform.dev/v1alpha2");
    assert.equal(doc.component, component);
    assert.equal(doc.workflow.job, f.profile.jobName);
    assert.equal(doc.candidate.digest, digest);
    assert.equal(
      doc.securityEvidence.artifactName,
      `${component}-security-evidence-123-attempt-2`,
    );
    for (const field of [
      doc.provenance.bundle,
      doc.securityEvidence.sbom,
      doc.securityEvidence.vulnerabilities,
    ]) {
      assert.equal(
        field.sha256,
        `sha256:${createHash("sha256")
          .update(readFileSync(join(f.directory, field.path)))
          .digest("hex")}`,
      );
    }
    assert.notEqual(f.run("emit.mjs").status, 0, "must not overwrite evidence");
  });
}
for (const [key, value] of Object.entries({
  COMPONENT: "../secret",
  GITHUB_JOB: "publish-static-artifact",
  GITHUB_REPOSITORY: "attacker/movie-reservation-agent",
  GITHUB_REF: "refs/pull/1/merge",
  GITHUB_EVENT_NAME: "pull_request",
  GITHUB_SHA: "abc",
  GITHUB_RUN_ID: "1\ninjected=true",
  GITHUB_RUN_ATTEMPT: "9007199254740992",
  GITHUB_SERVER_URL: "https://evil.test",
})) {
  test(`context rejects ${key}`, () =>
    assert.throws(() =>
      publicationContext({ ...environment(), [key]: value }),
    ));
}
test("legacy pilot and arbitrary digests cannot enter new profile", () => {
  assert.throws(() => profileFor("reservation-service"));
  assert.throws(() => requireDigest("latest"));
  assert.throws(() => profileFor("__proto__"));
  assert.notEqual(
    publicationContext(environment()).tag,
    publicationContext({ ...environment(), GITHUB_RUN_ATTEMPT: "3" }).tag,
  );
  assert.match(
    publicationContext(environment("reservation-web")).tag,
    /^ecs-demo-sha-/,
  );
});
for (const scenario of [
  "subject",
  "critical",
  "severity",
  "schema",
  "symlink",
  "attestation",
]) {
  test(`emitter fails closed for ${scenario}`, (t) => {
    const f = fixture(t);
    if (scenario === "subject")
      f.report.ArtifactName = `ghcr.io/attacker/image@${digest}`;
    if (scenario === "critical" || scenario === "severity") {
      f.report.Results = [
        {
          Vulnerabilities: [
            { Severity: scenario === "critical" ? "CRITICAL" : "surprise" },
          ],
        },
      ];
    }
    if (scenario === "schema") f.report.SchemaVersion = 1;
    f.put(f.profile.vulnerabilities, f.report);
    if (scenario === "attestation")
      f.env.ATTESTATION_URL = "https://evil.test/456";
    if (scenario === "symlink") {
      const path = join(f.directory, "security-evidence", f.profile.sbom);
      rmSync(path);
      symlinkSync(
        join(f.directory, "security-evidence", f.profile.provenance),
        path,
      );
    }
    assert.notEqual(f.run("emit.mjs").status, 0);
    assert.equal(
      existsSync(join(f.directory, "security-evidence", f.profile.document)),
      false,
    );
  });
}
test("preparation checks canonical remote before emitting outputs", (t) => {
  const f = fixture(t);
  const bin = join(f.directory, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "git"),
    '#!/bin/sh\nprintf "%s\\trefs/heads/main\\n" "$FAKE_MAIN"\n',
    { mode: 0o700 },
  );
  f.env.PATH = `${bin}:${process.env.PATH}`;
  f.env.FAKE_MAIN = f.env.GITHUB_SHA;
  assert.equal(f.run("prepare.mjs").status, 0);
  assert.match(readFileSync(f.env.GITHUB_OUTPUT, "utf8"), /run-123-attempt-2/);
  rmSync(f.env.GITHUB_OUTPUT);
  f.env.FAKE_MAIN = "c".repeat(40);
  assert.notEqual(f.run("prepare.mjs").status, 0);
  assert.equal(existsSync(f.env.GITHUB_OUTPUT), false);
  writeFileSync(
    join(bin, "git"),
    "#!/bin/sh\necho SENSITIVE_SENTINEL >&2\nexit 1\n",
    { mode: 0o700 },
  );
  const failed = f.run("prepare.mjs");
  assert.notEqual(failed.status, 0);
  assert.doesNotMatch(failed.stderr, /SENSITIVE_SENTINEL/);
});
test("vulnerability evaluator binds report and exposes HIGH without silently passing CRITICAL", (t) => {
  const f = fixture(t);
  Object.assign(f.env, {
    REPORT_PATH: `security-evidence/${f.profile.vulnerabilities}`,
    EXPECTED_IMAGE: `${f.profile.image}@${digest}`,
    SUBJECT_KIND: "immutable-ghcr",
    EVIDENCE_ARTIFACT_NAME: "diagnostics",
  });
  f.report.Results = [
    {
      Vulnerabilities: [
        {
          Severity: "HIGH",
          PkgName: "example",
          InstalledVersion: "1",
          VulnerabilityID: "test",
        },
      ],
    },
  ];
  f.put(f.profile.vulnerabilities, f.report);
  assert.equal(f.run("evaluate.mjs").status, 0);
  assert.match(readFileSync(f.env.GITHUB_OUTPUT, "utf8"), /high-count=1/);
  f.report.Results[0].Vulnerabilities[0].Severity = "CRITICAL";
  f.put(f.profile.vulnerabilities, f.report);
  assert.notEqual(f.run("evaluate.mjs").status, 0);
});
test("provenance verification uses constrained signer and removes rejected bundle", (t) => {
  const f = fixture(t);
  rmSync(join(f.directory, "security-evidence"), { recursive: true });
  const bin = join(f.directory, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(bin, "gh"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$ARGS_FILE"\necho SENSITIVE_SENTINEL >&2\nexit 1\n',
    { mode: 0o700 },
  );
  Object.assign(f.env, {
    PATH: `${bin}:${process.env.PATH}`,
    RUNNER_TEMP: f.directory,
    PROVENANCE_BUNDLE_PATH: join(f.directory, "bundle.json"),
    ARGS_FILE: join(f.directory, "args"),
    GH_TOKEN: "not-retained",
  });
  writeFileSync(f.env.PROVENANCE_BUNDLE_PATH, "{}");
  const failed = f.run("verify.mjs");
  assert.notEqual(failed.status, 0);
  assert.doesNotMatch(failed.stderr, /SENSITIVE_SENTINEL/);
  const args = readFileSync(f.env.ARGS_FILE, "utf8");
  for (const required of [
    "--source-digest",
    "--source-ref",
    "--deny-self-hosted-runners",
    "--cert-oidc-issuer",
    `github.com/${f.profile.repository}/.github/workflows/ci.yml`,
    `oci://${f.profile.image}@${digest}`,
  ])
    assert.ok(args.includes(required));
  assert.ok(!args.includes("not-retained"));
  assert.equal(
    existsSync(join(f.directory, "security-evidence", f.profile.provenance)),
    false,
  );
});
test("composite dependencies are immutable and canonical upload follows package attestation", () => {
  const action = readFileSync(
    resolve(root, "actions/container-evidence/action.yml"),
    "utf8",
  );
  const uses = [...action.matchAll(/uses: (\S+)/g)].map((match) => match[1]);
  assert.ok(uses.every((value) => /@[a-f0-9]{40}$/.test(value)));
  assert.ok(
    action.indexOf("Attest the exact four-file") <
      action.indexOf("Upload admissible"),
  );
  assert.match(action, /push-to-registry: false/);
  assert.match(action, /steps.verified.outcome == 'success'/);
});
