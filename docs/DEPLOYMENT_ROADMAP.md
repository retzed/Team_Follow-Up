# Deployment and Multi-Team Product Roadmap

## 1. Objective

Prepare Follow-Up for two supported delivery models:

1. **Hosted service:** teams create their own workspaces, invite colleagues, and securely access shared work from any supported browser and device.
2. **On-premises installation:** an organization runs the application and its data services inside infrastructure it controls, while employees access it through the organization’s network or approved remote access.

Both models should use the same product behavior, domain rules, and versioned API contract. Hosting, identity, persistence, and real-time delivery should be replaceable through well-defined adapters rather than separate application forks.

**Recommended order:** deliver the hosted multi-tenant service first, then complete the on-premises runtime using the same backend domain layer. The existing AWS code provides a useful starting point for the hosted path; the on-premises path requires additional infrastructure portability work.

## 2. Current baseline and gaps

### Public application repository

The application published through GitHub Pages is a static browser client. Its sign-in state, profiles, work items, activity history, and archive records are stored in browser storage. Data is isolated by browser profile and is not shared between different people, browsers, or devices. Its local sign-in is not production authentication, and browser storage is not a security boundary.

This edition is useful for evaluating the interface and local workflows. It is not a multi-user service and must not be used for confidential team records.

### AWS implementation repository

The separate AWS repository contains the Cognito integration, authenticated API client, Python Lambda handler, DynamoDB access layer, WebSocket change-delivery design, infrastructure template, tests, and deployment documentation.

The current documented design has important product gaps:

- Cognito self-service registration is disabled; the infrastructure template sets administrator-created accounts only.
- The API maps one Cognito subject to one enabled application profile. It does not yet model organizations, tenant memberships, or a user belonging to multiple teams.
- Work items, activity, archive, user-profile, and real-time access patterns are not yet partitioned by tenant.
- Existing privilege handling includes fixed administrator identities. Team labels are descriptive rather than a complete, tenant-scoped authorization model.
- There is no organization creation flow, invitation lifecycle, tenant administration, subscription management, or tenant-level data export/deletion workflow.
- The AWS implementation record is a dated account snapshot last updated 15 October 2026. Verify the actual AWS account and deployment state before reusing or modifying resources; the source repository and its target architecture do not prove that a live service is deployed.

Consequently, the existing AWS code must not be exposed as an open-signup service until tenant isolation and the account lifecycle are implemented and independently tested.

## 3. Target product model

### Organizations, users, and memberships

Treat a **user identity** and a **team workspace** as separate records.

- **User:** a person’s account identity and personal profile. A person should be able to join more than one team using the same verified identity.
- **Organization:** the tenant boundary for one team’s workspace, settings, subscription state, and data.
- **Membership:** the relationship between a user and an organization, including the user’s role and membership status.
- **Invitation:** a time-limited, single-use invitation that grants a specific organization membership after the recipient verifies their identity.

The first person who successfully creates an organization becomes its **Owner**. Initial roles should be **Owner**, **Admin**, and **Member**. A permission matrix must specify who can invite or remove members, manage organization settings, export data, and delete the organization. Role labels must not be treated as authorization by themselves.

### Tenant isolation is a server-side invariant

Every tenant-owned record must carry an immutable tenant identifier, including work items, activity events, archive snapshots, name-uniqueness records, real-time change records, and connection metadata.

The API must derive the active tenant from the authenticated user’s verified membership. It must never trust a tenant identifier supplied only by the browser. Every read, write, search, export, restore, and real-time delivery operation must verify both tenant membership and the requested resource’s tenant.

The DynamoDB key and index design must make tenant scoping part of the access path. Merely retrieving globally indexed records and filtering them in the browser—or applying a late response filter—is not acceptable isolation. Application caches, change cursors, WebSocket subscriptions, and background jobs must also be tenant-scoped.

For the hosted service, use shared infrastructure with tenant-keyed records initially. Revisit dedicated tables or dedicated AWS accounts only where customer contracts, scale, or regulatory requirements justify the operational cost.

## 4. Hosted service architecture

The first shared-data release can build on the existing AWS-oriented implementation, with a redesigned identity and data model.

~~~mermaid
flowchart LR
    User[Team member browser] --> Web[Amplify Hosting]
    Web --> Auth[Cognito]
    Web --> API[API Gateway HTTP API]
    Auth --> API
    API --> App[Python application logic]
    App --> Tenant[Tenant and membership records]
    App --> Items[Tenant-scoped work items]
    App --> Audit[Tenant-scoped activity and archive]
    App --> Realtime[Tenant-scoped change outbox]
    User <-->|Authenticated WebSocket| WS[API Gateway WebSocket API]
    App --> WS
    App --> Monitor[CloudWatch and alarms]
    WS --> Monitor
    API --> Monitor
~~~

### Account registration and workspace creation

Recommended registration sequence:

1. A person registers with a verified e-mail address through Cognito. Apply password policy, verification, abuse controls, and rate limits.
2. After authentication, the person chooses **Create a team** or **Accept an invitation**.
3. For team creation, the authenticated API validates the requested organization name and unique workspace identifier, then creates the organization and Owner membership as one idempotent provisioning operation.
4. The API records the new organization as the active workspace for that session. The browser receives only the organizations and memberships the current identity is authorized to access.
5. The Owner invites colleagues by e-mail. Invitation acceptance verifies the recipient identity, expiry, single-use token, organization, and assigned role before creating the membership.
6. A user with several memberships can switch workspaces. The API revalidates membership on every request; changing the selected workspace in the browser does not grant access.

For an initial private beta, enable registration only through controlled invitations. Enable unrestricted organization creation after provisioning, rate limiting, abuse handling, data isolation, and recovery procedures pass acceptance tests.

### AWS service responsibilities

| Area | Proposed service and responsibility |
|---|---|
| Frontend | Amplify Hosting serves the static application over HTTPS and publishes reviewed builds. |
| Identity | Cognito authenticates user identities and handles e-mail verification, password recovery, and token lifecycle. Organization membership remains application data, not a Cognito group assumption. |
| API | API Gateway HTTP API validates Cognito JWTs and forwards requests to the Python application. |
| Application logic | Python Lambda enforces membership, role permissions, hierarchy rules, validation, auditing, and tenant-scoped queries. |
| Persistence | DynamoDB stores organizations, memberships, invitations, work items, activity, archive, and real-time state with tenant-aware keys and indexes. |
| Real-time updates | The existing WebSocket/outbox pattern can be extended so change events and connection records are scoped to an organization and authorized members. |
| Operations | CloudWatch logs, metrics, alarms, dashboards, AWS Budgets notifications, and documented incident procedures. |

### Data model changes

Design the tenant-aware schema before changing production tables. A likely logical model is:

| Record type | Required ownership and key considerations |
|---|---|
| Organizations | Organization ID, normalized unique workspace slug, owner/member settings, plan and lifecycle status. |
| Users | Global identity/profile keyed by the application user ID and mapped to a verified identity-provider subject. |
| Memberships | Organization ID plus user ID; role, status, invitation source, and timestamps. |
| Invitations | Organization ID, hashed one-time token, invited e-mail, role, expiry, and consumed state. |
| Items | Tenant ID on every item; tenant-scoped item identity, parent lookup, assignee lookup, workspace lookup, and name uniqueness. |
| Activity | Tenant-scoped item history and application timeline, append-only event identity and ordering. |
| Archive | Tenant-scoped archive identity, parent/root metadata, and restore dependencies. |
| Real-time | Tenant-scoped outbox cursor and connection/session ownership, with expiry and deduplication. |

The existing global item-name rule should become unique within an organization, not across unrelated customers. Each GSI and uniqueness registry must include the tenant boundary in its partition/access key. Prepare an explicit migration design for existing data rather than changing key attributes in place without a backfill and rollback strategy.

### Security and operations requirements

Before inviting external organizations:

- Enforce organization membership and role permissions in the backend on every endpoint. Apply deny-by-default rules to administrative operations.
- Test cross-tenant access attempts for item IDs, parent IDs, user IDs, activity, search, archive, restore, exports, caches, and real-time events.
- Enable encryption in transit and at rest, protect signing/configuration secrets, and remove credentials and personal account mappings from source control and frontend bundles.
- Enable point-in-time recovery or an equivalent scheduled backup strategy for persistent data. Test restoration, not just backup creation.
- Configure API and WebSocket throttling, request validation, abuse detection, safe error responses, structured audit records, and operational alerts.
- Define data retention, user removal, organization deletion, export, and incident response procedures.
- Keep separate development, staging, and production environments. Use reviewed migrations and repeatable deployments; do not experiment against production tables.
- Select the production AWS Region based on customer location, latency, data-residency obligations, service availability, and recovery requirements rather than inheriting a development region by default.

A cost budget is an alerting mechanism, not a hard spending cap. Estimate costs under realistic tenant counts and usage before public registration.


### WhatsApp event notifications

Add an optional notification channel that sends a WhatsApp message to a team member when they are assigned a new Task/Follow-up or when an important update affects work already assigned to them. Keep WhatsApp as a user-controlled delivery channel alongside in-app notifications; an unavailable WhatsApp provider must never block saving a work-item change.

**Recommended provider:** the official Meta WhatsApp Business Platform Cloud API. Do not automate the consumer WhatsApp Web interface, use browser macros, or depend on unofficial WhatsApp libraries or personal-account automation.

**Notification preferences and consent**

- Add an international-format phone number (E.164) to the user's contact preferences and verify that the user controls it before enabling WhatsApp delivery.
- Ask for an explicit, recorded opt-in to receive Follow-Up task and assignment notifications on WhatsApp. Explain the sending business/name, the notification categories, and how to opt out. Keep consent timestamp, source, policy version, and current status.
- Let each user enable/disable WhatsApp notifications and choose event categories, such as new assignment, reassignment, priority escalation, due-date change, and significant status change. Provide quiet hours, a per-user timezone, and an immediate/batched delivery preference where appropriate.
- Honor opt-outs and revoked consent immediately, including requests made outside the application. Do not infer consent from a saved phone number or from a user being assigned work.
- Never send to unverified numbers or users who have opted out. Do not include sensitive descriptions, confidential notes, access tokens, or unnecessary personal information in the message.

**Events and delivery pipeline**

1. The work-item service commits its normal item and activity transaction and records a notification event in a durable outbox. Notification delivery is asynchronous and cannot roll back or delay the work-item update.
2. A notification worker resolves the affected assignees, checks organization membership, verified phone number, WhatsApp opt-in, notification preferences, quiet hours, and event relevance, then renders the approved template.
3. The worker sends through the configured WhatsApp Business Platform sender and stores the provider message ID, tenant, recipient user ID, event ID, template/version, timestamps, attempt count, and delivery state.
4. A verified HTTPS webhook receives provider status callbacks and updates message state (for example accepted/sent, delivered, read when available, or failed). Verify webhook authenticity, reject invalid payloads, and make processing idempotent.
5. Retry transient failures with bounded exponential backoff and jitter. Use an idempotency key based on the event, recipient, channel, and notification type to prevent duplicate sends. Route exhausted or permanent failures to a dead-letter queue and expose an operational alert; do not endlessly retry invalid numbers, revoked consent, or rejected templates.
6. Show useful notification status to the user or team administrator without exposing provider credentials or full message payloads.

The initial hosted release can use one Follow-Up-owned WhatsApp Business Account/sender for product notifications. Keep sender identity and credentials behind a provider adapter and tenant-aware configuration. Later, support organization-owned WhatsApp Business Accounts and sender numbers (for example through Meta Embedded Signup) where customers need messages to originate from their own business identity. Never silently mix senders or use one organization's credentials for another tenant.

**Message content and templates**

- Prepare and submit Meta-approved utility templates for transactional events, such as a new assignment and an important task update. Template category and approval are determined by Meta; do not assume an arbitrary free-form message can be sent.
- Include only concise context: Follow-Up or the configured business name, organization/workspace name where appropriate, item title, event type, actor, priority/due-date details when relevant, and a secure link back to the item.
- Business-initiated conversations require an approved template. Free-form replies are permitted only within the 24-hour customer-service window after the user messages the business; outside that window, use an approved template. Keep templates aligned with their approved purpose.
- Track message pricing, template quality/approval state, throughput limits, provider rate limits, and country-specific requirements. Messaging is an optional paid integration, not a guaranteed free channel.

**Security, privacy, and tenant isolation**

- Store access tokens, app secrets, webhook verification secrets, and sender identifiers in a managed secret store (AWS Secrets Manager/SSM for hosted AWS; a protected secret file or secrets manager for on-premises). Never expose them to the browser or commit them to Git.
- Scope sender configuration, opt-in records, phone numbers, outbox records, message logs, webhook events, and delivery status to the correct organization. Enforce tenant authorization in the backend.
- Minimize phone-number and message-content retention. Avoid writing message bodies and full recipient numbers to ordinary logs; use masked identifiers and correlation IDs.
- Define retention/deletion rules for consent evidence and delivery metadata, and include WhatsApp notification preferences in user export and account deletion workflows.
- Keep WhatsApp provider outages isolated from item operations and the in-app notification history. Monitor queue depth, send failures, webhook lag, template rejection, provider throttling, and cost.

Meta policy and technical documentation must be rechecked during implementation because requirements, pricing, template classification, and onboarding flows can change. See the [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) and [Meta's WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## 5. On-premises deployment architecture

The AWS implementation cannot simply be copied to a local server. Cognito, API Gateway, Lambda execution, DynamoDB access patterns, and API Gateway WebSockets are AWS-specific dependencies. A production on-premises version needs portable runtime and service adapters.

### Recommended portable stack

| Layer | On-premises option | Responsibility |
|---|---|---|
| Frontend | Existing static web build served by Nginx or Caddy | HTTPS delivery of the same application UI. |
| API/runtime | Python application hosted as an ASGI service, such as FastAPI | Run the same business rules outside Lambda. |
| Identity | Keycloak or a customer-managed OIDC provider; support enterprise SSO where required | Authentication, account lifecycle, and federation to customer identity systems. |
| Database | PostgreSQL | Shared work data, memberships, activity, archive, migrations, and tenant-aware constraints. |
| Real-time | WebSocket endpoint plus a transactional outbox worker; Redis may be added for multi-instance fan-out | Deliver tenant-scoped updates and recover missed events. |
| Operations | Container logs, metrics, health checks, and customer-selected monitoring | Availability, diagnostics, backup verification, and maintenance. |
| Packaging | Docker Compose for a first single-server installation; Kubernetes only when high availability or scale requires it | Repeatable installation, upgrades, and service orchestration. |

The on-premises version should use PostgreSQL row-level security as defense in depth, alongside explicit tenant and membership checks in the application. Database access must set the tenant context safely for every transaction. Background workers must carry and validate tenant ownership too.

For a first on-premises release, use **one organization per installation**. This gives customers a clear isolation boundary and reduces operational complexity. A shared multi-tenant on-premises installation can be considered later if a customer explicitly needs it.

### Packaging and operations

A supported installation should provide:

- Versioned container images for the frontend, API, worker, and required supporting services.
- A PostgreSQL service with persistent storage and an explicit migration process.
- A reverse proxy with TLS termination, security headers, and documented DNS/certificate configuration.
- Externalized configuration and secrets; no credentials baked into images or committed configuration files.
- SMTP configuration for invitations, verification, and account recovery.
- Health/readiness endpoints, structured logs, metrics, and clear service dependencies.
- Encrypted backups stored outside the application host, with documented retention and restore drills.
- A repeatable upgrade path with schema migration checks, rollback guidance, and compatibility notes.
- An installation guide, administrator guide, network/port requirements, sizing guidance, and troubleshooting procedures.

Docker Compose is appropriate for a first supported single-server package. It should not be marketed as highly available: production resilience requires redundant compute, database backups/replication, monitoring, and tested recovery. Kubernetes should be optional rather than a prerequisite for smaller customers.


### Optional WhatsApp integration

On-premises installations can use the same notification-provider interface, but the customer must configure a supported WhatsApp Business Platform sender and provide its own business account, verified sender, approved templates, and credentials. The installation needs outbound HTTPS connectivity to Meta's API and an inbound HTTPS webhook endpoint reachable by Meta (or a secured relay). If the customer cannot expose a webhook, document a supported relay/connector pattern rather than weakening webhook verification. Keep credentials in the installation's secrets manager, and scope consent, sender configuration, event queues, and delivery records to that installation. WhatsApp delivery remains optional; local task management must continue if internet access or Meta's service is unavailable.

## 6. Shared code strategy

Avoid maintaining separate copies of the business rules for AWS and on-premises.

1. Separate domain rules and use cases from Lambda event parsing, API Gateway request handling, DynamoDB calls, Cognito claim parsing, and WebSocket management calls.
2. Define versioned API schemas for authentication context, organizations, memberships, work items, activity, archive, and real-time change events.
3. Keep the current DynamoDB repository implementation behind a persistence interface. Add a PostgreSQL repository implementation for on-premises without duplicating hierarchy, assignment, validation, or audit rules.
4. Define identity-provider adapters that map verified OIDC identities to the same internal user/membership model. Cognito and Keycloak must not define different product permissions.
5. Use an outbox abstraction for reliable change delivery. AWS can publish through its WebSocket infrastructure; the on-premises runtime can use a worker and WebSocket service.
6. Version migrations and API contracts. Keep frontend behavior compatible with both supported backend modes and make deployment mode explicit at build/deployment time.
7. Add adapter contract tests so the same domain scenarios pass against DynamoDB and PostgreSQL.

Do not use LocalStack as the production on-premises runtime. It can be useful in isolated development tests, but a production installation needs supported database, identity, API, backup, and upgrade components.

## 7. Delivery phases

### Phase 0 — Product and architecture decisions

- Confirm the tenant model, team roles, organization ownership, membership switching, data export/deletion, and initial account-registration policy.
- Define what the Owner, Admin, and Member roles can do.
- Decide whether users may belong to multiple organizations; the recommended default is yes.
- Review current AWS resources and identify which existing resources can be reused safely.
- Approve tenant-aware logical and physical data schemas before any production migration.

**Exit criteria:** approved domain model, threat model, schema migration design, environment plan, and release acceptance checklist.

### Phase 1 — Backend separation and tenant foundation

- Extract domain/use-case logic from Lambda and provider-specific adapters.
- Add organizations, memberships, invitations, and tenant context to the API contract.
- Make all data access tenant-aware, including indexes, name uniqueness, activity, archive, caching, and real-time change delivery.
- Replace fixed root/user administrator exceptions with tenant-scoped authorization.
- Add migration/backfill and rollback tooling for existing records.

**Exit criteria:** automated tests prove that all repository access paths require a valid tenant context; the current single-team behavior remains covered by regression tests.

### Phase 2 — Hosted multi-tenant private beta

- Add verified account registration and authenticated organization creation.
- Implement Owner/Admin/Member permissions, invitation acceptance, membership revocation, and workspace switching.
- Deploy isolated development, staging, and production environments.
- Enable backups, monitoring, throttling, and operational runbooks.
- Run a small private beta with multiple deliberately separate organizations.

**Exit criteria:** cross-tenant negative tests pass for every data path; invited users can join; revoked users lose access; data recovery and real-time isolation are verified.

- Add the durable notification outbox and asynchronous worker for assignment and significant-update events.
- Add WhatsApp opt-in, verified phone numbers, per-user event preferences, quiet hours/timezone, and immediate/batched delivery settings.
- Integrate the official WhatsApp Business Platform sender, approved utility templates, authenticated status webhooks, idempotent retries, and failure monitoring.
- Launch messaging with a Follow-Up-owned sender for the private beta; keep the adapter ready for organization-owned senders later.

**Exit criteria:** no messages are sent without recorded opt-in; template/window rules are enforced; duplicate and cross-tenant sends are blocked; delivery/failure callbacks reconcile correctly; provider outages do not interrupt item updates.

### Phase 3 — Hosted public onboarding

- Enable controlled public organization sign-up after beta acceptance.
- Add tenant-level usage limits, abuse controls, support diagnostics, legal/privacy notices, retention and deletion workflows.
- Add billing only when pricing and commercial requirements are agreed; do not couple tenant creation to a payment provider prematurely.
- Add an organization data export and a validated import path for local workspaces.
- Publish service status, support, recovery, and data-handling documentation.

**Exit criteria:** onboarding, support, tenant lifecycle, monitoring, data export/deletion, and commercial operations are ready for external customers.

- Add organization-level notification controls and per-tenant messaging quotas/cost visibility.
- Provide sender onboarding and verification guidance. Add organization-owned WhatsApp Business Account onboarding only after the shared sender workflow is stable.
- Include messaging consent, opt-out, delivery records, retention, and deletion in privacy and support workflows.

### Phase 4 — On-premises compatibility

- Complete the portable Python runtime and PostgreSQL repository adapter.
- Add OIDC integration for Keycloak and document customer-managed identity federation.
- Implement the PostgreSQL outbox and on-premises real-time delivery service.
- Package the supported services and database migrations as versioned containers.
- Publish the single-organization Docker Compose installation, backup/restore, upgrade, and hardening guides.

**Exit criteria:** a clean installation can be deployed from documentation, upgraded to a later release, backed up, restored, and validated without AWS resources.

- Add an optional notification worker and provider adapter, with per-installation WhatsApp Business credentials, approved templates, consent records, and webhook configuration.
- Document outbound connectivity, public HTTPS webhook or secured relay requirements, secret rotation, provider outages, and message-cost ownership.

### Phase 5 — Enterprise operations and optional scale-out

- Add high-availability deployment patterns, centralized metrics/logging integration, and tested disaster recovery.
- Evaluate Kubernetes or customer-specific orchestration only where required.
- Add enterprise SSO options, customer-controlled retention, and deployment-specific compliance controls.
- Consider isolated AWS accounts or dedicated data stores for hosted customers with contractual isolation requirements.

**Exit criteria:** supported operational profiles and a clear support boundary exist for each hosting model.

## 8. Existing data migration

Browser-local data must not be silently uploaded during sign-in. Provide an explicit export/import process:

1. Export the workspace from the browser-local edition into a versioned, documented file format.
2. Validate records, references, duplicate names, hierarchy rules, user assignments, timestamps, and activity identity.
3. Let the organization Owner map existing profiles to verified accounts and memberships.
4. Preview counts, warnings, and conflicts before import.
5. Import into the selected organization with a migration ID and audit record so retries do not duplicate items or events.
6. Verify item counts, parent-child links, assignees, archive records, and activity history after import.
7. Preserve the original export for the customer until they confirm the migration. Never transfer local passwords or root credentials.

The same logical export format should be supported by both hosted and on-premises deployments.

## 9. Release acceptance checklist

A release is not ready for real team data until all relevant checks pass:

- A verified user can create an organization and becomes its Owner exactly once, even if the request is retried.
- An invited user can join only the organization named in the valid invitation.
- One identity can switch between memberships without carrying data or permissions from the previous organization.
- A user removed from an organization cannot continue reading or mutating its data with an old browser cache or WebSocket connection.
- Cross-tenant attempts fail for guessed item IDs, parent IDs, profile IDs, API filters, archive IDs, export jobs, and real-time events.
- Search, item hierarchy, assignment filters, activity history, archive/restore, name uniqueness, and audit history are tenant-scoped.
- Concurrent edits, retries, failed writes, and real-time catch-up do not create duplicate activity or leak tenant data.
- Backup restoration is demonstrated in a separate environment.
- The on-premises installation can be installed, upgraded, backed up, and restored using the published procedures.
- Browser-local data is never represented as server-synchronized or securely authenticated.

- WhatsApp is sent only to a verified number with a current, recorded opt-in and matching user preferences.
- New assignment and configured important-update events notify only the affected current assignees; unrelated users and other tenants receive nothing.
- Approved template and customer-service-window rules are enforced, and template rejection or provider outages never affect item persistence.
- Duplicate event delivery, webhook retries, worker restarts, and transient failures do not cause duplicate user messages.
- Delivered/read/failed statuses are reconciled where the provider supplies them; permanent failures are surfaced without endless retries.
- A user can opt out and stop future WhatsApp notifications promptly; opt-out is respected across hosted and on-premises installations.
- Sender credentials, phone numbers, message records, and delivery webhooks remain tenant-scoped and are never exposed to the frontend or ordinary logs.

## 10. Decisions to make before implementation

| Decision | Recommended starting point |
|---|---|
| First delivery target | Hosted AWS multi-tenant private beta. |
| Public registration | Invite-only beta first; public organization sign-up only after isolation tests pass. |
| User membership | One identity may belong to multiple organizations. |
| Authorization | Owner, Admin, Member with backend-enforced permission checks. |
| Hosted data isolation | Shared AWS services with tenant-aware physical keys and server-side checks. |
| On-premises isolation | One organization per installation for the first supported release. |
| On-premises runtime | Python ASGI API, PostgreSQL, OIDC provider, outbox worker, WebSockets, and Docker Compose. |
| Legacy data | Explicit export/import; no automatic browser-storage migration. |
| Billing | Defer until the hosted beta and pricing model are agreed. |
| Region and residency | Decide from expected customers, applicable requirements, latency, and recovery objectives. |
| WhatsApp notifications | Official WhatsApp Business Platform; Follow-Up-owned sender for the hosted beta, optional organization-owned sender later; explicit per-user opt-in and preferences. |
## 11. Implementation boundary

This document is a roadmap, not a claim that the features above are already implemented or deployed. The GitHub Pages application remains browser-local. The AWS repository remains the starting point for the hosted backend, but self-service organization registration and tenant isolation are prerequisite engineering work. On-premises support requires the separate portable runtime and PostgreSQL path described above.

Keep implementation work in the appropriate repository: shared frontend/API contract changes should be coordinated across both repositories; AWS infrastructure and cloud operations belong in the AWS deployment repository; portable deployment packaging and on-premises operational guides should be added as that delivery target is implemented.
