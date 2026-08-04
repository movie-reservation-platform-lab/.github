# Movie Reservation Platform Lab

Movie Reservation Platform Lab is an open-source learning platform for building a small reservation system as a production-shaped service ecosystem.

The platform explores:

- a movie reservation API and UI
- an AI agent that can help users discover screenings and make reservations
- MCP tools that expose platform capabilities to agents
- a recommendation service for movie suggestions
- platform engineering practices around CI, observability, deployment, and service boundaries

The goal is not only to build the application, but to make the engineering tradeoffs visible: repository boundaries, contract testing, telemetry, deployment gates, and safe service evolution.

## Repositories

- `golden-path-ecs-template`: migration source for the original reservation service, frontend demonstrator, ECS/CDK infrastructure, and platform documentation
- `movie-platform-infra`: standalone AWS CDK platform infrastructure
- `movie-platform-environments`: environment manifest, promotion gates, and delivery telemetry model
- `movie-reservation-service`: standalone NestJS reservation API
- `movie-reservation-web`: standalone Vite/React reservation frontend
- `movie-reservation-agent`: Python reservation agent
- `movie-reservation-mcp`: MCP wrapper for reservation API capabilities
- `movie-recommendation-service`: Rust recommendation API
- `movie-recommendation-mcp`: MCP wrapper for recommendation API capabilities

## Current Status

The organization is being shaped incrementally. Core component repositories now exist; backlog is being moved into the correct trackers while the golden-path repository remains the migration source until extracted services pass CI and smoke checks.
