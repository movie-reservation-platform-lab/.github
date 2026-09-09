import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync, lstatSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { publicationContext } from "./profile.mjs";

// Derived from the reservation-service pilot; dependency-free in the privileged job.
const profile = publicationContext(process.env);
const sourceRepository = profile.repository;
const candidateRepository = `ghcr.io/${sourceRepository}`;
const sourceRef = "refs/heads/main";
const githubServerUrl = "https://github.com";
const evidenceDocumentPath =
  "security-evidence/component-candidate-evidence-v1alpha2.json";
const provenanceBundlePath = `security-evidence/${profile.provenance}`;
const sbomPath = `security-evidence/${profile.sbom}`;
const vulnerabilityReportPath = `security-evidence/${profile.vulnerabilities}`;

/**
 * @typedef {{ unknown: number, low: number, medium: number, high: number, critical: number }} VulnerabilityCounts
 */

try {
  const workspace = realpathSync(
    requireEnvironmentVariable("GITHUB_WORKSPACE"),
  );
  const sourceRevision = requireEnvironmentVariable("GITHUB_SHA");
  const runId = requireEnvironmentVariable("GITHUB_RUN_ID");
  const runAttempt = parsePositiveInteger(
    requireEnvironmentVariable("GITHUB_RUN_ATTEMPT"),
    "GITHUB_RUN_ATTEMPT",
  );
  const candidateDigest = requireEnvironmentVariable("CANDIDATE_DIGEST");
  const attestationId = requireEnvironmentVariable("ATTESTATION_ID");
  const attestationUrl = requireEnvironmentVariable("ATTESTATION_URL");

  requireExactEnvironmentVariable("GITHUB_REPOSITORY", sourceRepository);
  requireExactEnvironmentVariable("GITHUB_REF", sourceRef);
  requireExactEnvironmentVariable("GITHUB_SERVER_URL", githubServerUrl);
  requireExactEnvironmentVariable("CANDIDATE_REPOSITORY", candidateRepository);
  validatePattern(
    "GITHUB_SHA",
    sourceRevision,
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/,
  );
  validatePattern("GITHUB_RUN_ID", runId, /^[1-9][0-9]*$/);
  validatePattern("CANDIDATE_DIGEST", candidateDigest, /^sha256:[0-9a-f]{64}$/);
  validatePattern("ATTESTATION_ID", attestationId, /^[1-9][0-9]*$/);

  const expectedAttestationUrl = `${githubServerUrl}/${sourceRepository}/attestations/${attestationId}`;
  if (attestationUrl !== expectedAttestationUrl) {
    throw new Error(`ATTESTATION_URL must be ${expectedAttestationUrl}.`);
  }

  const artifactName = profile.artifact;
  const immutableCandidate = `${candidateRepository}@${candidateDigest}`;
  const vulnerabilityCounts = readVulnerabilityCounts(
    workspace,
    immutableCandidate,
  );
  if (vulnerabilityCounts.critical > 0)
    throw new Error("CRITICAL findings block canonical evidence");
  const evidence = {
    apiVersion: "ci.movie-platform.dev/v1alpha2",
    kind: "ComponentCandidateEvidence",
    component: profile.component,
    source: {
      repository: sourceRepository,
      revision: sourceRevision,
      ref: sourceRef,
    },
    workflow: {
      path: ".github/workflows/ci.yml",
      job: profile.jobName,
      runId,
      runAttempt,
      url: `${githubServerUrl}/${sourceRepository}/actions/runs/${runId}/attempts/${runAttempt}`,
    },
    candidate: {
      repository: candidateRepository,
      digest: candidateDigest,
      platform: {
        os: "linux",
        architecture: "amd64",
      },
    },
    provenance: {
      subjectName: candidateRepository,
      subjectDigest: candidateDigest,
      predicateType: "https://slsa.dev/provenance/v1",
      attestationId,
      attestationUrl,
      bundle: {
        path: provenanceBundlePath,
        sha256: hashWorkspaceFile(workspace, provenanceBundlePath),
        format: "sigstore-bundle-json",
      },
    },
    securityEvidence: {
      artifactName,
      sbom: {
        path: sbomPath,
        sha256: hashWorkspaceFile(workspace, sbomPath),
        format: "cyclonedx-json",
      },
      vulnerabilities: {
        path: vulnerabilityReportPath,
        sha256: hashWorkspaceFile(workspace, vulnerabilityReportPath),
        format: "trivy-json",
        subject: immutableCandidate,
        counts: vulnerabilityCounts,
      },
    },
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(workspace, evidenceDocumentPath),
    `${JSON.stringify(evidence, null, 2)}\n`,
    {
      encoding: "utf8",
      flag: "wx",
    },
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);

  console.error(`Unable to emit candidate evidence: ${message}`);
  process.exitCode = 1;
}

/**
 * @param {string} name
 * @returns {string}
 */
function requireEnvironmentVariable(name) {
  const value = process.env[name];

  if (value === undefined || value.length === 0) {
    throw new Error(`Required environment variable ${name} is missing.`);
  }

  return value;
}

/**
 * @param {string} name
 * @param {string} expected
 * @returns {void}
 */
function requireExactEnvironmentVariable(name, expected) {
  const value = requireEnvironmentVariable(name);

  if (value !== expected) {
    throw new Error(`${name} must be ${expected}.`);
  }
}

/**
 * @param {string} name
 * @param {string} value
 * @param {RegExp} pattern
 * @returns {void}
 */
function validatePattern(name, value, pattern) {
  if (!pattern.test(value)) {
    throw new Error(`${name} has an unsupported value.`);
  }
}

/**
 * @param {string} value
 * @param {string} name
 * @returns {number}
 */
function parsePositiveInteger(value, name) {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${name} must be a positive integer.`);
  }

  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} exceeds the supported integer range.`);
  }

  return parsed;
}

/**
 * @param {string} workspace
 * @param {string} expectedImage
 * @returns {VulnerabilityCounts}
 */
function readVulnerabilityCounts(workspace, expectedImage) {
  const reportPath = resolveWorkspaceFile(workspace, vulnerabilityReportPath);
  const report = /** @type {unknown} */ (
    JSON.parse(readFileSync(reportPath, "utf8"))
  );

  if (
    !isRecord(report) ||
    report.SchemaVersion !== 2 ||
    report.ArtifactType !== "container_image"
  ) {
    throw new Error(
      "Vulnerability report is not a supported Trivy container report.",
    );
  }

  if (report.ArtifactName !== expectedImage) {
    throw new Error(
      `Vulnerability report subject does not match ${expectedImage}.`,
    );
  }

  /** @type {VulnerabilityCounts} */
  const counts = { unknown: 0, low: 0, medium: 0, high: 0, critical: 0 };
  const results = report.Results;

  if (results === undefined || results === null) {
    return counts;
  }

  if (!Array.isArray(results)) {
    throw new Error("Vulnerability report Results must be an array.");
  }

  for (const [resultIndex, result] of results.entries()) {
    if (!isRecord(result)) {
      throw new Error(
        `Vulnerability report result ${resultIndex} must be an object.`,
      );
    }

    const vulnerabilities = result.Vulnerabilities;
    if (vulnerabilities === undefined || vulnerabilities === null) {
      continue;
    }

    if (!Array.isArray(vulnerabilities)) {
      throw new Error(
        `Vulnerabilities at result ${resultIndex} must be an array.`,
      );
    }

    for (const [
      vulnerabilityIndex,
      vulnerability,
    ] of vulnerabilities.entries()) {
      if (
        !isRecord(vulnerability) ||
        typeof vulnerability.Severity !== "string"
      ) {
        throw new Error(
          `Vulnerability ${vulnerabilityIndex} at result ${resultIndex} has no valid Severity.`,
        );
      }

      const severity = vulnerability.Severity.toLowerCase();
      switch (severity) {
        case "unknown":
        case "low":
        case "medium":
        case "high":
        case "critical":
          counts[severity] += 1;
          break;
        default:
          throw new Error(
            `Vulnerability ${vulnerabilityIndex} at result ${resultIndex} has unsupported severity.`,
          );
      }
    }
  }

  return counts;
}

/**
 * @param {string} workspace
 * @param {string} relativePath
 * @returns {string}
 */
function hashWorkspaceFile(workspace, relativePath) {
  return `sha256:${createHash("sha256")
    .update(readFileSync(resolveWorkspaceFile(workspace, relativePath)))
    .digest("hex")}`;
}

/**
 * @param {string} workspace
 * @param {string} relativePath
 * @returns {string}
 */
function resolveWorkspaceFile(workspace, relativePath) {
  const requested = resolve(workspace, relativePath);
  if (
    !lstatSync(requested).isFile() ||
    lstatSync(requested).size > 64 * 1024 * 1024
  ) {
    throw new Error("Evidence must be a bounded regular file");
  }
  const path = realpathSync(requested);
  const pathWithinWorkspace = relative(workspace, path);

  if (
    pathWithinWorkspace === ".." ||
    pathWithinWorkspace.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    ) ||
    isAbsolute(pathWithinWorkspace)
  ) {
    throw new Error(
      `Evidence path must stay inside GITHUB_WORKSPACE: ${relativePath}`,
    );
  }

  return path;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
