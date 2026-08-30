# FindBD

Bangladesh-focused lost & found platform with automatic Lost↔Found matching.

Built with a full-stack TypeScript monorepo: **Next.js 16** frontend, **Express 5** API, and **MongoDB** data layer.

## Live Demo

- **Frontend:** https://findbd-web.vercel.app
- **Backend API:** https://findbd.onrender.com

## Screenshot

![Landing Page](docs/screenshots/landing.png)

## Features

- File **lost** and **found** reports with rich details (item name, category, brand, model, colour, date, time, district, area, description, reward)
- **Automatic matching engine** that scores Lost↔Found pairs against a 100-point blueprint:
  - Location (30), Category (20), Brand (15), Colour (10), Date (10), Time (10), Description (5)
- **Match tiers**: Possible (≥60), Strong (≥75), Excellent (≥90)
- **Private fields** kept secret until ownership is verified:
  - Lost side: location description, reward, ownership questions
  - Found side: additional details only the real owner would know
- **Report lifecycle**: Active → Matched → Claimed → Resolved/Closed
- **Browse & search** with filters for type, category, district, and free-text search
- **Dashboard** with personal reports, matches, and notifications
- **Image uploads** via Cloudinary (up to 5 images per report)
- **Bangladesh-aware**: 64 districts, local area names, Bangla text support
- **JWT authentication** with access + refresh tokens, rate limiting, Helmet security headers

## Tech Stack

| Layer | Tools |
|-------|-------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, Motion |
| Backend | Express 5, Node.js, Mongoose, JOSE (JWT), Argon2 |
| Validation | Zod (strict schemas) |
| Database | MongoDB |
| Media | Cloudinary |
| Testing | Vitest, Supertest, mongodb-memory-server |
| Monorepo | npm workspaces |

## Project Structure

```
findbd/
├── apps/
│   ├── web/           # Next.js frontend
│   │   ├── app/       # Pages (register, login, report/lost, report/found, reports, dashboard, notifications)
│   │   ├── components/
│   │   └── lib/
│   └── api/           # Express API
│       └── src/
│           ├── modules/   # Auth, reports, matches, notifications, reference
│           ├── models/    # Mongoose schemas
│           ├── middleware/# Auth, validation, rate limiting
│           ├── services/  # Token, media, notification
│           └── test/      # Integration tests
├── packages/
│   └── shared/        # Shared types, Zod schemas, enums, Bangladesh location data
└── .env.example       # API environment template
```

## Getting Started

### Prerequisites

- Node.js >= 20.11.0
- MongoDB (local or Atlas)
- Cloudinary account (optional, for image uploads)

### Installation

```bash
git clone https://github.com/<your-username>/findbd.git
cd findbd
npm install
```

### Environment Variables

Copy the example env file and fill in your values:

```bash
cp .env.example apps/api/.env
```

Key variables in `apps/api/.env`:

| Variable | Description |
|----------|-------------|
| `PORT` | API port (default: 4000) |
| `WEB_ORIGIN` | Frontend origin for CORS (default: http://localhost:3000) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | 32+ character secret for access tokens |
| `JWT_REFRESH_SECRET` | 32+ character secret for refresh tokens |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (optional) |
| `CLOUDINARY_API_KEY` | Cloudinary API key (optional) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret (optional) |

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### Development

Start both API and web dev servers:

```bash
npm run dev
```

Or start them individually:

```bash
npm run dev:api   # Express on http://localhost:4000
npm run dev:web   # Next.js on http://localhost:3000
```

### Database

Check database connectivity and seed sample data:

```bash
npm run db:check
npm run seed
```

### Build & Typecheck

```bash
npm run build
npm run typecheck
```

### Testing

```bash
npm test
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start API + web dev servers concurrently |
| `npm run dev:api` | Start Express API in watch mode |
| `npm run dev:web` | Start Next.js dev server |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | TypeScript typecheck across all packages |
| `npm test` | Run API test suite |
| `npm run seed` | Seed database with sample data |
| `npm run db:check` | Verify database connection |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Register |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh tokens |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/reports` | List reports (search, filter, sort) |
| POST | `/api/reports` | Create lost/found report |
| GET | `/api/reports/:id` | Get report detail |
| PATCH | `/api/reports/:id` | Update report (owner only) |
| POST | `/api/reports/:id/status` | Change report status |
| POST | `/api/reports/:id/save` | Watch / save report |
| DELETE | `/api/reports/:id/save` | Unwatch report |
| GET | `/api/reports/saved` | List saved reports |
| POST | `/api/reports/:id/media` | Upload report images |
| GET | `/api/matches` | List matches for current user |
| POST | `/api/matches/:id/dismiss` | Dismiss a match |
| GET | `/api/notifications` | List notifications |
| POST | `/api/notifications/:id/read` | Mark notification read |
| GET | `/api/reference/categories` | List categories |
| GET | `/api/reference/districts` | List Bangladesh districts |

## Architecture Notes

- **Shared package** (`packages/shared`) is the single source of truth for types, enums, and Zod schemas. Both API and web import from it.
- **Strict Zod schemas** on all inputs — unknown keys are rejected, not stripped, so typos like `color` vs `colour` surface as 422 errors immediately.
- **Visibility layer** (`domain/visibility.ts`) strips private fields before serialising reports for non-owners.
- **Scoring engine** runs automatically on report creation and on every edit of a scored field. Candidate pairs are capped to prevent table scans in busy categories.

## License
LICENSED — Raihan Rimon.
