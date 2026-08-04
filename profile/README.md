# Movie Reservation Platform Lab

Movie Reservation Platform Lab is an open-source learning platform for building
a small movie reservation system as a production-shaped service ecosystem.

The platform explores:

- a reservation API and browser UI
- an AI agent that can help users discover movies and request reservations
- MCP tools that expose reservation and recommendation capabilities to agents
- a Rust recommendation service for movie suggestions
- AWS ECS/Fargate infrastructure, static frontend delivery, and safe teardown
- platform engineering practices around CI, observability, deployment gates, and
  service boundaries

The goal is not only to build the application, but to make the engineering
tradeoffs visible: repository boundaries, contract testing, telemetry,
deployment gates, and safe service evolution.

## Direction

The near-term focus is a production-shaped AWS demo that connects the public web
UI, reservation API, Python agent, recommendation API, MCP integrations,
distributed runtime observability, and a credible deployment/DORA observability
model.

This is still a learning lab, not a production service. Public CI should remain
credential-free, application repositories should publish immutable artifacts,
and platform infrastructure should consume pinned artifact references from an
environment manifest.

## Repositories

- `golden-path-ecs-template`: migration source for the original reservation
  service, frontend demonstrator, ECS/CDK infrastructure, and platform
  documentation
- `movie-platform-infra`: standalone AWS CDK platform infrastructure
- `movie-platform-environments`: environment manifests, promotion gates, and
  delivery telemetry model
- `movie-reservation-service`: standalone NestJS reservation API
- `movie-reservation-web`: standalone Vite/React reservation frontend
- `movie-reservation-agent`: Python reservation agent
- `movie-reservation-mcp`: MCP wrapper for reservation API capabilities
- `movie-recommendation-service`: Rust recommendation API
- `movie-recommendation-mcp`: MCP wrapper for recommendation API capabilities

## Current Status

The organization is being shaped incrementally. Core component repositories now
exist; backlog is being moved into the correct trackers while the golden-path
repository remains the migration source until extracted services pass CI and
smoke checks.

The local experimental baseline has already proven the end-to-end flow:

```text
browser -> Python agent -> recommendation MCP -> Rust recommendation API
                        -> reservation MCP -> NestJS reservation API
```

That baseline is a reference for extraction and hardening work. It should not
be treated as production readiness.
