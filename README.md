# Resell-Lausanne Integration Hub

Feed aggregator for Galaxus and Shopify, plus future suppliers.

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Use `make` commands (defined in `Makefile`) to manage the stack or run tests via `make test`.

## Prisma

Before running the worker or tests, generate the Prisma client:

```bash
npx prisma generate --schema packages/db/prisma/schema.prisma
```
