import {
  copyFileSync,
  constants,
  lstatSync,
  mkdirSync,
  realpathSync,
  chmodSync,
  unlinkSync,
  appendFileSync,
} from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import { publicationContext, requireDigest } from "./profile.mjs";

function inside(root, file) {
  const path = relative(root, file);
  if (!path || path.startsWith("..") || isAbsolute(path))
    throw new Error("Unsafe evidence path");
}

// The bundle comes from GitHub's attestation action, not from producer source files.
let retained;
try {
  const profile = publicationContext(process.env);
  const digest = requireDigest(process.env.CANDIDATE_DIGEST);
  const workspace = realpathSync(process.env.GITHUB_WORKSPACE);
  const temp = realpathSync(process.env.RUNNER_TEMP);
  const input = process.env.PROVENANCE_BUNDLE_PATH;
  if (!lstatSync(input).isFile() || lstatSync(input).size > 4 * 1024 * 1024) {
    throw new Error("Provenance bundle must be a bounded regular file");
  }
  const bundle = realpathSync(input);
  inside(temp, bundle);
  const directory = join(workspace, "security-evidence");
  mkdirSync(directory, { mode: 0o700 }); // Reject existing files, directories and symlinks.
  retained = join(directory, profile.provenance);
  copyFileSync(bundle, retained, constants.COPYFILE_EXCL);
  chmodSync(retained, 0o600);
  try {
    execFileSync(
      "gh",
      [
        "attestation",
        "verify",
        `oci://${profile.image}@${digest}`,
        "--repo",
        profile.repository,
        "--bundle",
        retained,
        "--signer-workflow",
        `github.com/${profile.repository}/${profile.workflow}`,
        "--source-ref",
        "refs/heads/main",
        "--source-digest",
        process.env.GITHUB_SHA,
        "--predicate-type",
        "https://slsa.dev/provenance/v1",
        "--cert-oidc-issuer",
        "https://token.actions.githubusercontent.com",
        "--deny-self-hosted-runners",
        "--format",
        "json",
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 120000,
        maxBuffer: 1024 * 1024,
      },
    );
  } catch {
    throw new Error("Candidate provenance verification failed");
  }
  retained = undefined;
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `artifact=${profile.artifact}\nimage=${profile.image}@${digest}\n`,
  );
} catch (error) {
  if (retained) unlinkSync(retained);
  // Child-process errors can include captured output; do not publish credentials or bundles.
  console.error(
    error.code ? "Unable to retain candidate provenance safely" : error.message,
  );
  process.exitCode = 1;
}
