# Bertuah CRM

Internal operations platform for a BPKB-secured multipurpose financing aggregator (mobil & motor), starting in Pekanbaru with 1 admin + 2 telemarketing agents.

**Phase 1 (current):** project foundation and UI shell — Next.js 16, Tailwind v4, shadcn/ui, branded to match [chassisvin.com](https://www.chassisvin.com/) (Inter font, blue-600 primary). Agent and admin dashboards run on mock data; no backend yet.

**Coming in later phases:** Supabase (auth, Postgres, RLS), the drip-feed lead queue, call logging, application/leasing pipeline, and the incentive engine — see the PRD in `C:\CRM` for the full spec.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Routes: `/login`, `/agent/dashboard`, `/admin/dashboard`.

## Stack

- Next.js 16 (App Router, Turbopack)
- TypeScript, Tailwind CSS v4
- shadcn/ui (Base UI primitives)
- Supabase (planned, Phase 2+)

Deployed on Vercel.
