import { appendFileSync } from "node:fs";
import { publicationContext, requireDigest } from "./profile.mjs";

const profile = publicationContext(process.env);
requireDigest(process.env.CANDIDATE_DIGEST);
appendFileSync(
  process.env.GITHUB_OUTPUT,
  `image_ref=${profile.image}\nartifact=${profile.artifact}\n`,
);
