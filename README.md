# Handshake POC Build Package

A proof-of-concept build package for Handshake: the game scheduler for travel baseball.

## Includes
- Supabase SQL schema
- Next.js starter app structure
- Core scheduling/conflict logic
- Product requirements
- Wireframes
- Lovable/Bolt prompt
- MVP backlog

## Stack
- Next.js
- React
- Tailwind
- Supabase
- Vercel

## Local setup
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local`.
4. Add your Supabase URL and anon key.
5. Run:

```bash
npm install
npm run dev
```

## MVP Scope
Included:
- Team directory
- Coach/team profiles
- Blackout dates
- Propose/counter/confirm workflow
- Confirmed games
- Basic conflict detection

Excluded:
- Payments
- Tournament scheduling
- Umpires
- Scorekeeping
- Native mobile app
