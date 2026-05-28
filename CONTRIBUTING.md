# Contributing to ClipSE

ClipSE is a pnpm workspace using Next.js App Router, TypeScript, Drizzle, tRPC, TanStack Query, Better Auth, and Docker Compose.

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

For local checks:

```bash
pnpm check
pnpm typecheck
pnpm test:unit
```

## Development Notes

- Use TypeScript for new code.
- Keep mutations in server actions under `apps/web/src/server/actions`.
- Keep queries in tRPC routers under `apps/web/src/server/api/routers`.
- Keep domain types and validation in module domain folders.
- Use Drizzle migrations generated with `pnpm db:generate`.
- Do not commit `.env`, media caches, build output, coverage, or private deployment credentials.

## Tests

- Add or update tests for every behavior change.
- Create test data with the project's Object Mother helpers in `apps/web/tests/mothers`.
- Use domain mothers with `.create(...)`, such as `ClipSEVideoMother.create()` and `ClipSEMother.create({ status: "ready" })`, for valid domain objects with focused overrides.
- Use repository mothers with `.create(...)`, such as `ClipSEVideoRepositoryMother.create()` and `ClipSERepositoryMother.create({ findById: vi.fn(...) })`, to mock repository interfaces in use case tests.
- Add new mother helpers when adding new domain objects, repository interfaces, or recurring test data shapes.
- Keep tests independent: each test should create its own objects, repositories, mocks, and overrides.
- Avoid sharing mutable fixtures between tests. Prefer factory calls inside each `it` block or inside a local setup helper that returns fresh values.
- Assert behavior and observable outputs instead of implementation details.
- Reset or recreate mocks between tests when a suite uses shared mock modules or spies.
- Keep unit tests deterministic by avoiding real network, storage, database, timers, or filesystem access unless the test is explicitly integration-level.

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Run `pnpm check`, `pnpm typecheck`, and `pnpm test:unit` before opening a PR.
- Include any Docker Compose or environment changes in `.env.example` and the docs.
