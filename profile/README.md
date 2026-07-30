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

- `golden-path-ecs-template`: reservation service, frontend demonstrator, ECS/CDK infrastructure, and platform documentation
- `movie-reservation-agent`: planned home for the Python agent
- `movie-reservation-mcp`: planned home for MCP tools around the reservation API
- `movie-recommendation-service`: planned home for the recommendation API
- `movie-recommendation-mcp`: planned home for MCP tools around recommendations

## Current Status

The organization is being shaped incrementally. Repository boundaries and CI/CD gates are being planned before moving service code, so each migration can stay small and reviewable.
