import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { publicationContext } from "./profile.mjs";

// Narrow shell adapter: pure policy is testable without git, GHCR or credentials.
try {
  const profile = publicationContext(process.env);
  let remote;
  try {
    remote = execFileSync(
      "git",
      [
        "ls-remote",
        "--exit-code",
        `https://github.com/${profile.repository}.git`,
        "refs/heads/main",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
        maxBuffer: 4096,
      },
    ).trim();
  } catch {
    throw new Error("Unable to resolve canonical main revision");
  }
  if (remote !== `${process.env.GITHUB_SHA}\trefs/heads/main`) {
    throw new Error("Refusing stale or ambiguous main revision");
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `image_ref=${profile.image}\ntag=${profile.tag}\nartifact=${profile.artifact}\n`,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
