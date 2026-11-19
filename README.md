# Follow-Up

**Follow-Up** is a bilingual (English/Arabic) team work-management web application for organizing Projects, Jobs, Tasks, and Follow-ups in one hierarchical workspace. It combines assignment management, progress and priority tracking, activity history, archive/restore, responsive layouts, and English/Arabic RTL/LTR support.

**Application:** [retzed.github.io/Team_Follow-Up](https://retzed.github.io/Team_Follow-Up/)  
**Documentation:** [Project guide](PROJECT_GUIDE.md) · [Architecture](docs/ARCHITECTURE.md) · [Complete application reference](docs/DOCUMENTATION.md) · [Deployment roadmap](docs/DEPLOYMENT_ROADMAP.md)  
**AWS implementation:** [Follow-Up AWS Deployment](https://github.com/retzed/Team_Follow-Up_AWS-Deployment)

> **Current hosting boundary:** the GitHub Pages version is a browser-local edition. Its profiles and work records are stored in each visitor's browser; they are not shared between different people, browsers, or devices. Its local sign-in is not production authentication. Do not use this edition for confidential or sensitive team information.

## Product capabilities

- Organizes Projects and Jobs at the top level, with Tasks and Follow-ups beneath eligible parent items.
- Tracks assignees, priorities, status, descriptions, due dates where applicable, and item changes.
- Provides item-level and application-wide activity history.
- Supports archive, hierarchy-aware restore, search, assignment filters, and overview metrics.
- Includes bilingual English/Arabic interface text, mixed-language item names, RTL/LTR layouts, and light/dark themes.
- Adapts to desktop, tablet, and mobile browser sizes.

## Application and deployment status

Follow-Up currently has two distinct implementation tracks:

| Track | Current role | Data and identity model |
|---|---|---|
| GitHub Pages application in this repository | Public static browser application | Browser-local profiles and data. No shared server database or secure server-side sign-in. |
| AWS implementation in the separate repository | Starting point for a shared hosted service | Cognito authentication, API Gateway, Python Lambda, DynamoDB, and WebSocket change-delivery components with deployment documentation. |

The AWS implementation is not yet an open-registration, multi-tenant service. Organization creation, invitations, tenant-scoped data isolation, and self-service team onboarding are defined in the [deployment roadmap](docs/DEPLOYMENT_ROADMAP.md). The AWS repository's implementation record documents its last verified account snapshot; check it before assuming that any cloud resources are currently deployed.

The roadmap also defines an on-premises delivery model. That requires a portable backend runtime, PostgreSQL persistence, an OIDC identity provider, and supported installation/upgrade/backup procedures; it is not achieved by hosting the current static files on an internal server.

## Try the hosted application

Open the [Follow-Up application](https://retzed.github.io/Team_Follow-Up/). The browser-local edition includes preconfigured workspace profiles and a populated workspace so that its workflows and layouts can be explored.

The active identity and workspace records are saved in browser localStorage. The current page, selected item, filters, expanded rows, and scroll position are saved separately for each tab in sessionStorage. Open tabs in the same browser profile can receive local change notifications, but those notifications do not travel over the internet. A different browser profile or device has separate data.

## Run locally

Clone the repository:

~~~bash
git clone https://github.com/retzed/Team_Follow-Up.git
cd Team_Follow-Up
~~~

Open index.html in a modern browser, or serve the repository over HTTP.

**Python**

~~~bash
python -m http.server 8000
~~~

Open [http://localhost:8000](http://localhost:8000).

No third-party npm packages are required for the current frontend build or regression suite. Node.js 24 or newer is recommended for validation and building.

~~~bash
npm test
npm run build
~~~

The static build is generated in dist/. To preview the built artifact:

~~~bash
python -m http.server 8000 --directory dist
~~~

## Application architecture

The GitHub Pages edition is a static browser client. The UI uses an asynchronous data-access interface whose current public build is configured to use the in-browser adapter.

~~~mermaid
flowchart TD
    Member[Visitor] --> Pages[GitHub Pages]
    Pages --> Browser[Browser application]
    Browser --> LocalAuth[Browser-local sign-in]
    LocalAuth --> UI[Follow-Up interface]
    UI --> API[TeamFollowUpDataApi]
    API --> Store[Browser localStorage]
    Store --> Items[Work items and hierarchy]
    Store --> Activity[Activity events]
    Store --> Archive[Archived items]
    Store --> Profiles[Local profiles]
    Browser --> View[Per-tab view state]
    View --> TabStore[sessionStorage]
~~~

This repository contains the public frontend, bundled typography, build scripts, regression checks, and product documentation. The AWS-specific backend and infrastructure documentation are maintained separately.

## Repository structure

~~~text
.
├── index.html
├── package.json
├── PROJECT_GUIDE.md
├── RELEASE_NOTES.md
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DOCUMENTATION.md
│   └── DEPLOYMENT_ROADMAP.md
├── assets/
│   └── fonts/
├── scripts/
└── .github/
    └── workflows/
        └── pages.yml
~~~

## Build and publishing

The GitHub Actions workflow in .github/workflows/pages.yml runs the regression suite, builds the static application, and publishes the dist/ artifact to GitHub Pages when changes reach main. Pull requests run validation without publishing.

- [Workflow runs](https://github.com/retzed/Team_Follow-Up/actions)
- [GitHub Pages application](https://retzed.github.io/Team_Follow-Up/)

## Security and data handling

The current GitHub Pages edition stores its local workspace in the visitor's browser. Client-side sign-in, browser storage, and cross-tab notifications do not provide secure authentication, server-side authorization, shared persistence, backup, or cross-device synchronization. Do not store credentials, customer information, employee-sensitive notes, or confidential work in this edition.

The hosted multi-tenant and on-premises delivery requirements—including identity, tenant isolation, authorization, data migration, backups, and operational controls—are documented in the [deployment roadmap](docs/DEPLOYMENT_ROADMAP.md).