# Platform architecture and observability

This document describes the demo topology, service boundaries and signal paths.
Pinned source links identify inspected baselines; the selected deployment revision
is authoritative for runtime behavior.

## 1. Request flow and deployment boundary

```mermaid
flowchart LR
    Browser["Browser: React booking UI"] --> ALB["Restricted application ALB"]
    subgraph Task["One ECS Fargate application task"]
        Web["Web container: static assets and Nginx"]
        Agent["Python reservation agent"]
        RecMCP["Recommendation MCP wrapper"]
        RecAPI["Rust recommendation API"]
        ResMCP["Reservation MCP wrapper"]
        ResAPI["NestJS reservation API"]
        State["In-process demo reservation state"]
        Collector["ADOT collector sidecar"]
        Router["FireLens / Fluent Bit sidecar"]
        Web -->|"GraphQL booking and availability"| ResAPI
        Web -->|"Agent workflow API"| Agent
        Agent -->|"Recommendation tools"| RecMCP
        RecMCP -->|"HTTP"| RecAPI
        Agent -->|"Catalog, reservation and status tools"| ResMCP
        ResMCP -->|"GraphQL"| ResAPI
        ResAPI --> State
    end
    ALB --> Web
    Web -->|"Serves UI assets"| Browser
```

There are **six application containers plus two sidecars**, not six independently
deployed ECS services. Containers in this task communicate over task-local
networking. The browser reaches Nginx through the ALB; it does not directly reach
private API/MCP ports. ADOT and FireLens are shown for placement; their paths are
in the next diagram.

The manual booking path uses the reservation API. Agent-assisted booking first
obtains recommendations, then uses reservation tools to select a screening,
request a seat and poll its result. The demo agent is a deterministic orchestration
path; the repository name does not imply a live external LLM dependency here.

The demonstrated composition uses in-process reservation state and an in-process
worker, not a durable database. Reloading the browser should read current state,
but task replacement can discard it. A task restart can affect all application
components and erase useful evidence. Health/readiness checks are separate from
the user workflow and do not prove successful booking.

## 2. Signals, storage and investigation tools

Solid arrows show baseline routing. Dashed arrows identify the optional Tempo
addition, which requires separate deployment and runtime verification.

```mermaid
flowchart LR
    subgraph AppTask["Shared application Fargate task"]
        Apps["Six application containers"]
        ADOT["ADOT collector"]
        FireLens["FireLens / Fluent Bit"]
        Apps -->|"OTLP from instrumented components"| ADOT
        Apps -->|"stdout and stderr"| FireLens
    end
    ADOT -->|"Prometheus remote write"| AMP["Amazon Managed Service for Prometheus"]
    ADOT -->|"Traces"| XRay["AWS X-Ray"]
    ADOT -->|"Selected metrics"| CW["CloudWatch logs and metrics"]
    FireLens -->|"Operational logs"| CW
    FireLens -->|"Validated authentication audit events"| Firehose["Amazon Data Firehose"]
    Firehose --> Audit["S3 audit archive"]
    Audit --> Athena["Glue catalog and Athena queries"]
    subgraph TempoTask["Optional separate private Fargate task"]
        Tempo["Tempo: ephemeral trace storage"]
    end
    ADOT -.->|"Second trace export"| Tempo
    Investigator["Grafana browser"] --> AMG["Amazon Managed Grafana"]
    AMG -->|"PromQL metrics and alert evaluation"| AMP
    AMG -->|"Logs Insights and metrics"| CW
    AMG -->|"Fallback trace queries"| XRay
    AMG -.->|"Private query connection"| Tempo
```

| Signal | What to use | Important limitation |
| --- | --- | --- |
| Metrics | AMP PromQL in Managed Grafana | Scope to the supplied environment/service/route; a metric alert identifies a time window, not one trace. |
| Traces | Tempo when confirmed available; X-Ray otherwise | Not every component/hop is instrumented. Missing spans are not proof a dependency was never called. |
| Operational logs | CloudWatch Logs Insights, including through Grafana | Trace/log navigation is manual in this version; some events have only request/correlation IDs. |
| Audit events | Separate Firehose → S3 → Glue/Athena path, when enabled and authorized | This custom audit archive is **not Amazon Security Lake**, and is not the main incident-debugging log stream. |
| Alert state | Grafana alert rules and dashboard context | Rule evaluation and notification delivery are separate; verify both when configuring alerts. |

AMP remains the metrics backend. Mimir, Loki and browser RUM/Faro are not part of
this architecture baseline. Adding Tempo does not automatically add native Loki-style
trace-to-log navigation. The proposed Tempo service is separate from the app task,
but uses ephemeral task storage: replacing/stopping it loses its trace history.
Existing X-Ray export is retained as a fallback. Neither tracing nor stdout
collection should be interpreted as a durable transactional audit guarantee.

Tempo connectivity and the small symptom dashboard are separate reviewed changes:
[Tempo infrastructure PR #56](https://github.com/movie-reservation-platform-lab/movie-platform-infra/pull/56)
and [Grafana alert/dashboard PR #55](https://github.com/movie-reservation-platform-lab/movie-platform-infra/pull/55).
Their existence is not proof of a particular live deployment.

## 3. Public source map

These are public, read-only entrypoints inspected for this guide. The pinned
links make the reference stable; use the corresponding paths at the selected deployment revision when it differs.

| Repository | Start reading here | Purpose |
| --- | --- | --- |
| [movie-reservation-web](https://github.com/movie-reservation-platform-lab/movie-reservation-web) | [Nginx routes](https://github.com/movie-reservation-platform-lab/movie-reservation-web/blob/cff8e731c846a53f45e32657b67740770ffd77ef/container/nginx.conf), [API clients](https://github.com/movie-reservation-platform-lab/movie-reservation-web/tree/cff8e731c846a53f45e32657b67740770ffd77ef/src/platform/api) | Browser requests and same-origin proxy boundary. |
| [movie-reservation-agent](https://github.com/movie-reservation-platform-lab/movie-reservation-agent) | [Workflow orchestration](https://github.com/movie-reservation-platform-lab/movie-reservation-agent/blob/7bf742b1d179a4e495fc0a6f17bb86a76c100dd1/llm_agent/llm_agent/services/demo/reservation.py), [MCP adapter](https://github.com/movie-reservation-platform-lab/movie-reservation-agent/blob/7bf742b1d179a4e495fc0a6f17bb86a76c100dd1/llm_agent/llm_agent/infrastructure/mcp/demo_client.py) | Dependency calls, outcomes and context propagation. |
| [movie-recommendation-mcp](https://github.com/movie-reservation-platform-lab/movie-recommendation-mcp) | [Tool server](https://github.com/movie-reservation-platform-lab/movie-recommendation-mcp/blob/3d64ee989c200266faa0914cc82106f54b14dd38/src/axum_tools_mcp/server.py) | Maps recommendation tools to HTTP dependency calls. |
| [movie-recommendation-service](https://github.com/movie-reservation-platform-lab/movie-recommendation-service) | [HTTP boundary](https://github.com/movie-reservation-platform-lab/movie-recommendation-service/blob/cbb7304dfe803afb3a4b3ba803932c07c9119ef9/src/http/mod.rs), [Telemetry](https://github.com/movie-reservation-platform-lab/movie-recommendation-service/blob/cbb7304dfe803afb3a4b3ba803932c07c9119ef9/src/telemetry.rs) | Request handling, status, spans, metrics and structured events. |
| [movie-reservation-mcp](https://github.com/movie-reservation-platform-lab/movie-reservation-mcp) | [Tool server](https://github.com/movie-reservation-platform-lab/movie-reservation-mcp/blob/9512371138533307fd4ea4ac9e6bdbdf0e2eefcd/src/movie_reservation_mcp/server.py) | Catalog, reservation request and status tools. |
| [movie-reservation-service](https://github.com/movie-reservation-platform-lab/movie-reservation-service) | [GraphQL presentation](https://github.com/movie-reservation-platform-lab/movie-reservation-service/tree/722909fcfc5f80c5b29c425c1eb3c30883a51e51/src/presentation/graphql), [Observability](https://github.com/movie-reservation-platform-lab/movie-reservation-service/tree/722909fcfc5f80c5b29c425c1eb3c30883a51e51/src/infrastructure/observability) | Booking/availability boundaries and server-side signals. |
| [movie-platform-infra](https://github.com/movie-reservation-platform-lab/movie-platform-infra) | [Task composition](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/51b38cc21eb58c8468d0ea5f30769e6b571a56ce/lib/infra-stack.ts), [Collector](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/51b38cc21eb58c8468d0ea5f30769e6b571a56ce/adot-collector/adot-config.yaml), [Audit router](https://github.com/movie-reservation-platform-lab/movie-platform-infra/tree/51b38cc21eb58c8468d0ea5f30769e6b571a56ce/audit-router) | Actual deployment ownership, telemetry destinations and audit/log separation. |

Application repositories publish immutable artifacts and evidence. Environment
control selects exact identities, governs ECR admission, and reviews deployment.
Registry admission is separate from deployment; architecture documentation alone
is not evidence that a particular release or optional backend is running.
