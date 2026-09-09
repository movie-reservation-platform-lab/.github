/** Closed runnable-image profiles. Static web OCI bundles are deliberately absent. */
const jobs = {
  "reservation-agent": ["publish-image", "publish immutable GHCR image"],
  "recommendation-service": ["publish-image", "publish immutable GHCR image"],
  "reservation-mcp": ["publish-image", "publish immutable GHCR image"],
  "recommendation-mcp": ["publish-image", "publish immutable GHCR image"],
  "reservation-web": ["publish-ecs-image", "publish temporary ECS image"],
};

/** Resolve reviewed identity, never arbitrary paths, repositories or signer inputs. */
export function profileFor(component) {
  if (!Object.hasOwn(jobs, component))
    throw new Error("Unsupported container component");
  const [jobId, jobName] = jobs[component];
  const repository = `movie-reservation-platform-lab/movie-${component}`;
  return Object.freeze({
    component,
    repository,
    jobId,
    jobName,
    image: `ghcr.io/${repository}`,
    workflow: ".github/workflows/ci.yml",
    document: "component-candidate-evidence-v1alpha2.json",
    provenance: `${component}-provenance.json`,
    sbom: `${component}.cdx.json`,
    vulnerabilities: `${component}-vulnerabilities.json`,
    tagPrefix: component === "reservation-web" ? "ecs-demo-sha" : "sha",
  });
}

/** Pure publication authorization; shared code never grants itself caller permissions. */
export function publicationContext(env) {
  const profile = profileFor(env.COMPONENT);
  const exact = {
    GITHUB_REPOSITORY: profile.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "push",
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_JOB: profile.jobId,
  };
  for (const [key, expected] of Object.entries(exact)) {
    if (env[key] !== expected)
      throw new Error(`${key} is not the canonical publication context`);
  }
  if (!/^[0-9a-f]{40}$/.test(env.GITHUB_SHA ?? ""))
    throw new Error("Invalid source revision");
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"]) {
    if (
      !/^[1-9][0-9]*$/.test(env[key] ?? "") ||
      !Number.isSafeInteger(Number(env[key]))
    ) {
      throw new Error(`Invalid ${key}`);
    }
  }
  return Object.freeze({
    ...profile,
    artifact: `${profile.component}-security-evidence-${env.GITHUB_RUN_ID}-attempt-${env.GITHUB_RUN_ATTEMPT}`,
    tag: `${profile.tagPrefix}-${env.GITHUB_SHA}-run-${env.GITHUB_RUN_ID}-attempt-${env.GITHUB_RUN_ATTEMPT}`,
  });
}

export function requireDigest(value) {
  if (!/^sha256:[0-9a-f]{64}$/.test(value ?? ""))
    throw new Error("Invalid candidate digest");
  return value;
}
