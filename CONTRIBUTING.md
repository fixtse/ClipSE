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

## Pull Requests

- Keep changes focused.
- Add or update tests for behavior changes.
- Run `pnpm check`, `pnpm typecheck`, and `pnpm test:unit` before opening a PR.
- Include any Docker Compose or environment changes in `.env.example` and the docs.
