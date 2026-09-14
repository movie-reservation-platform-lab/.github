# Audit logging architectures and cost evaluation

Status: draft analysis for discussion, not an approved architecture decision or
a procurement estimate. Prepared 2026-09-14.

## Executive summary

The lab demonstrates a **custom AWS audit lake using S3 and Athena**, not Amazon
Security Lake. Application authentication events use a constrained OCSF contract;
using that standard does not imply using the managed Security Lake product.

The next evaluation should compare cost, durability, investigation speed, and
operational ownership. Start with three candidates:

1. An optimized version of the existing S3/Athena architecture.
2. A durability-hardened archive path with acknowledged acceptance or an outbox.
3. Amazon Security Lake for managed security-data integration.

Evaluate Loki or OpenSearch as an optional searchable hot copy, not automatically
as a replacement for the evidence archive. A cheaper pipeline and a stronger
audit trail are not equivalent unless their guarantees are made explicit.

This analysis inspected local infrastructure source and documentation, not live
AWS resources or billing. It does not establish current deployment status,
production readiness, or regulatory compliance. Prices must be refreshed for the
selected region and purchasing agreement before presenting a financial estimate.

## 1. Implemented architecture and repository ownership

The primary architecture repository is
[`movie-platform-infra`](https://github.com/movie-reservation-platform-lab/movie-platform-infra).
`movie-platform-environments` owns delivery and admission automation, rather than
the runtime audit storage pipeline.

```text
Application audit events
  -> stdout
  -> ECS FireLens / AWS for Fluent Bit
  -> validation and routing
  -> Amazon Data Firehose (Direct PUT)
  -> S3 archive (JSONL, GZIP)
  -> AWS Glue Data Catalog + Athena SQL queries

ALB access logs -------------------------> separate S3 bucket
CloudTrail write-management events ------> audit archive prefix

Ordinary application logs -> CloudWatch Logs
Application traces -> OpenTelemetry / ADOT -> X-Ray
Application metrics -> ADOT -> AMP / CloudWatch
Grafana -> investigation and visualization
```

Source references at the inspected infrastructure revision:

- [Architecture, diagram, delivery guarantees, and gaps](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/6c6eedf1528b9707428611375e7cf45dfe7eadc4/docs/architecture/audit-and-observability.md)
- [AuditStack implementation](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/6c6eedf1528b9707428611375e7cf45dfe7eadc4/lib/audit-stack.ts)
- [Fluent Bit routing configuration](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/6c6eedf1528b9707428611375e7cf45dfe7eadc4/audit-router/platform.conf)
- [Application audit contract](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/6c6eedf1528b9707428611375e7cf45dfe7eadc4/docs/contracts/platform-audit-v1.json)
- [Athena investigation queries](https://github.com/movie-reservation-platform-lab/movie-platform-infra/blob/6c6eedf1528b9707428611375e7cf45dfe7eadc4/docs/operations/audit-queries.sql)

These are historical source anchors, not a claim that the documentation describes
every subsequent application change. Consult the repository's current branch
when planning implementation.

### Component responsibilities

| Component | Responsibility |
| --- | --- |
| Fluent Bit through ECS FireLens | Collect, validate, buffer, and route records |
| Amazon Data Firehose | Batch and deliver application audit records to S3 |
| S3 | Store evidence objects |
| Glue Data Catalog | Describe schemas and partition locations; it is not the evidence store |
| Athena | Query the S3 files |
| CloudTrail | Capture configured AWS control-plane activity, not application login events |
| CloudWatch / X-Ray / Grafana | Operational investigation and visualization alongside audit evidence |

The application contract describes constrained **OCSF 1.3 Authentication events**,
not the whole OCSF standard. ALB and CloudTrail records remain in separate native
formats and tables. This is not a fully normalized security dataset.

### Correlation

- Stable audit event IDs connect responses, operational references, and archived
  events; they also provide a deduplication key.
- Request and correlation IDs connect application records for an action.
- Actual OpenTelemetry trace/span IDs connect events with logs and X-Ray.
- The captured ALB trace header bridges application records and ALB access logs.
  Its root is not assumed to equal the application's OpenTelemetry trace ID.
- CloudTrail event IDs, principals, and resource identifiers support a separate
  AWS configuration/activity investigation path.

Correlation is not an assurance that every trace was sampled or retained for as
long as the audit record. Multiple distinct audit events can share a trace ID.

## 2. Existing guarantees and limitations

The implemented pipeline is useful security audit logging, but is not lossless
or administrator-proof evidence:

- A successful stdout write does not acknowledge Firehose or S3 persistence.
- The router buffers on task-local storage. Task loss, exhausted buffers, or a
  prolonged delivery failure can lose undelivered events.
- Retries can produce duplicates; consumers must deduplicate by event identity.
- The current archive is encrypted and versioned, but does not use S3 Object Lock.
- Application containers share a task role, limiting producer isolation.
- Archive and ALB objects default to 30-day current-object retention. Noncurrent
  versions can remain billable beyond that interval. Query results expire sooner.

For a database-backed business mutation that must have durable audit evidence,
evaluate committing an audit outbox record in the same transaction. A relay can
then publish with retries. Adding Kinesis downstream of stdout alone does not
close the failure window before durable acceptance.

An outbox addresses atomic recording; transport, archive retention, access
isolation, reconciliation, and recovery still require their own design. Failed
attempts without a committed business transaction need an explicit recording
policy too. See the [AWS transactional outbox pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).

## 3. Candidate architectures

These options operate at different layers and can be combined. Fluent Bit is a
collector, a stream is a transport, and Security Lake is a managed security-data
lake. They are not interchangeable products.

| Approach | Reason to consider it | Cost drivers and tradeoffs |
| --- | --- | --- |
| Current: Fluent Bit -> Firehose -> S3/Athena | Simple managed delivery and occasional SQL investigation | Collector resources, Firehose ingestion, storage, requests, queries, endpoints; existing producer durability gap |
| Fluent Bit -> S3 directly -> Athena | Remove Firehose from delivery | Potential delivery savings; greater ownership of buffering, uploads, recovery, object sizing, and monitoring |
| Durable producer/outbox -> Kinesis -> archive and consumers | Replay, independent consumers, near-real-time processing | Database/relay overhead, stream capacity or usage, reads, retention, consumers, archive delivery |
| Amazon Security Lake -> Athena/security tools | Managed security-source integration and normalization | AWS-source ingestion/normalization, underlying services, storage, custom-source preparation, queries |
| CloudWatch-first | Operational search using familiar AWS tooling | Ingestion, retained bytes, query scanning, and optional forwarding/archive duplication |
| S3 archive + Loki/OpenSearch/managed hot search | Faster interactive investigation | Additional ingestion/indexing, compute, hot retention, replication, and operations |

### Direct-to-S3 collection

Fluent Bit has an [S3 output](https://docs.fluentbit.io/manual/data-pipeline/outputs/s3).
Evaluate its actual buffering and upload semantics under process/task failure,
including persistent storage requirements and small-object behavior. Removing a
managed service removes its fee, not its responsibilities.

### Streaming transport

Kinesis Data Streams adds retained, replayable data and independent consumers.
Its cost depends on capacity mode, ingestion, retrieval, retention, and consumer
configuration. It is distinct from the Firehose Direct PUT path already used.
See [Kinesis pricing](https://aws.amazon.com/kinesis/data-streams/pricing/).

Kafka/MSK belongs on the extended shortlist if the organization already operates
Kafka or needs its ecosystem. Do not introduce a new broker platform merely on
the assumption that it makes a small logging deployment cheaper.

### Amazon Security Lake

Security Lake is a separate managed service. Its pricing distinguishes
AWS-source ingestion and normalization. AWS currently states that bringing your
own or third-party data has no Security Lake ingestion charge; this does **not**
make custom ingestion free overall. Storage, supporting services, queries, and
your transformation pipeline remain chargeable.

Custom sources must meet OCSF and Parquet requirements. Our constrained JSONL
archive cannot simply be relabeled as a Security Lake custom source.
See [Security Lake pricing](https://aws.amazon.com/security-lake/pricing/) and
[custom-source requirements](https://docs.aws.amazon.com/security-lake/latest/userguide/custom-sources.html).

### Search layer

Compare [CloudWatch](https://aws.amazon.com/cloudwatch/pricing/),
[OpenSearch](https://aws.amazon.com/opensearch-service/pricing/), and
[Grafana Cloud](https://grafana.com/pricing/) against the same investigation
workload. For self-hosted Loki, include infrastructure, upgrades, backups,
availability, and on-call effort rather than treating open-source software as
zero-cost operation.

Keep the searchable copy rebuildable from the archive if the archive is intended
to be the authoritative evidence store. A preferred query UI does not by itself
establish durability or retention guarantees.

## 4. Pricing mechanics that matter

### Collector capacity

Fluent Bit does not introduce a per-GB hosted-service fee by itself. Its costs are
CPU, memory, buffering storage, networking, and maintenance.

The documented demo allocates 128 CPU units and 256 MiB to its router inside an
existing 2-vCPU/4-GiB Fargate task. This did not increase that task's configured
size, but consumes capacity available to applications. Measure whether collection
forces larger tasks or more instances at the target throughput.

### Small-record rounding in Firehose

For the implemented Direct PUT path, Firehose ingestion uses 5-KiB record
increments. API batching does not eliminate rounding of individual records.
GZIP compression of the S3 output occurs after ingestion.
See [Firehose pricing](https://aws.amazon.com/firehose/pricing/) and
[the documented 5,120-byte billing increment](https://docs.aws.amazon.com/firehose/latest/dev/limits.html).

Illustrative payload calculation, not a regional price quote:

```text
100 events/second * 30 days = 259.2 million events

Assuming exactly 1 KiB per submitted record:
  raw payload:                 approximately 247 GiB/month
  rounded ingestion quantity: approximately 1,236 GiB/month
```

Use the actual submitted record-size distribution, including framing, in a real
estimate. Do not multiply an S3 compressed-byte measurement by an ingestion rate.
Verify each service's billing units rather than mixing decimal GB and binary GiB.

### Storage and queries

Model retained compressed bytes separately from ingestion. Include current and
noncurrent versions, S3 requests, lifecycle transitions, retrieval, and any
replication or duplicate hot copy. Model startup accumulation separately from
steady-state retention.

Query cost depends on the selected query engine/pricing mode and workload. For
Athena scan-based SQL pricing, measure scanned bytes for realistic queries;
partitioning, columnar formats, and compaction can change this materially.
Conversion and compaction also have costs and should not be assumed free.
See [S3 pricing](https://aws.amazon.com/s3/pricing/) and
[Athena pricing](https://aws.amazon.com/athena/pricing/).

### Fixed and shared costs

Private interface endpoints can incur hourly and data-processing charges even
at low audit traffic. Separate audit-specific resources from shared networking,
application compute, dashboards, operational logs, and traces. Do not attribute
the whole lab bill to the audit pipeline.
See [PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/).

Also account for selected encryption/key management, monitoring, CloudTrail
configuration, cross-region transfer, support, and operational labour. A stream
or self-hosted search service can introduce a baseline cost absent from a mostly
usage-priced archive.

## 5. Reproducible evaluation method

### Establish one workload sheet

Record these inputs per source, not just as one blended log volume:

- Average and peak events/second, burst duration, and growth forecast.
- Record-size distribution and measured compression ratio.
- Application audit, CloudTrail, ALB, and any proposed WAF/VPC/DNS sources.
- Hot and archival retention; versioning, immutability, and residency requirements.
- Queries/day, scanned time windows, selectivity, and concurrent investigators.
- Acceptable event visibility delay, recovery time, and loss tolerance.
- Replay period, ordering requirements, and number of independent consumers.
- Accounts, regions, availability zones, and replication requirements.

Run low/base/high scenarios, for example 10, 100, and 1,000 events/second.
These are sensitivity scenarios, not measured lab traffic or business forecasts.
Use identical guarantees and retention when comparing architecture totals.

### Cost model

```text
Monthly infrastructure cost =
  collection + transport + transformation
  + storage + queries/search
  + networking + security/monitoring services

Total ownership cost =
  infrastructure + recurring operational labour
  + separately identified implementation/migration cost
```

Track quantities and unit prices independently. For example:

```text
Monthly events = average events/second * seconds in the modelled month
Ingestion quantity = sum of per-record billable sizes
Steady retained bytes ~= compressed bytes/day * effective retention days
Query scan quantity = sum of bytes scanned by representative monthly queries
```

The retention approximation needs adjustments for versions, duplicate copies,
growth, lifecycle transitions, and the first-month ramp. Include retries and
reprocessing where material.

### Pricing and measurement steps

1. Build estimates in [AWS Pricing Calculator](https://calculator.aws/) using
   eu-central-1 consistently unless another region is explicitly in scope.
2. Record the pricing date, currency, billing units, tax treatment, discounts,
   support allocation, and source URLs. Keep trials and credits separate.
3. Show idle baseline, expected monthly cost, burst sensitivity, first-month
   storage, and mature-retention storage.
4. Replay representative sanitized events through each candidate. Measure
   collector overhead, throughput, delivery lag, object sizes, and compression.
5. Run the same investigation queries and measure latency and scanned bytes.
6. Test downstream outages, collector/task termination, buffer exhaustion,
   duplicates, replay, and recovery. Reconcile produced, accepted, and archived IDs.
7. Compare observed billing by service and usage type with the model. Explain
   discrepancies rather than extrapolating the small demo bill directly.

Suggested workbook tabs: assumptions, measured workloads, unit prices,
architecture line items, sensitivity scenarios, benchmark results, and risks.

Suggested leadership comparison columns: monthly infrastructure cost, operating
hours/month, implementation effort, visibility delay, durability boundary,
retention/isolation guarantees, and confidence in the estimate.

## 6. Open decisions and next work

Before selecting an architecture, answer:

- Is this primarily operational investigation or an authoritative audit trail?
- Which events must be durably recorded before an operation succeeds?
- Which sources, accounts, and retention periods are actually required?
- Is occasional SQL sufficient, or is fast interactive search a requirement?
- Are replay and multiple independent consumers required?
- Is an existing organizational Kafka, SIEM, or logging platform available?
- What are the team's operational capacity and monthly budget?

Recommended next slice: collect a representative workload and produce the shared
pricing worksheet before implementing a migration. Keep OCSF standardization,
delivery durability, archive protection, and search experience as distinct
decisions, even when a managed product helps with several of them.

This document intentionally approves no deployment, retention change, new
service, migration, or claim of compliance.
