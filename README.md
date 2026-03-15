# Walkie

## Introduction

Walkie is a web application that tracks walking progress of your favorite regions.
Why walking the same route every single time while there's so much paths just waiting to
be discovered. App supports all walking explorers to uncover the uknown!

Walkie lets users set preferences like duration, starting & finish points or
accessibility, and receive a walking route displayed on an interactive map.

Spatial data (paths, points of interest, areas) is provided by operators through
standard geospatial formats. No city or region is hardcoded - the system grows as new
datasets are uploaded.

## Features Available

**Track progress of walking your favorite regions**:

![overvall view](docs/assets/overall_view.png)

**Compose routes and download GPX for map guidance**:

![compose route](docs/assets/route_composing.png)

**Draw a random route to inspire yourself**:

![generate route](docs/assets/route_generation.png)

... **and many more** - try it for youself!

## Tech Stack

- **Backend**: Django + Django REST Framework + GeoDjango
- **Frontend**: Next.js + Leaflet.js
- **Database**: PostgreSQL + PostGIS + pgRouting
- **Infrastructure**: Docker, GitHub Actions

## Prerequisites

- **Python 3.14+** (managed via [uv](https://docs.astral.sh/uv/))
- **Node.js 25+** / npm 11+
- **Docker Desktop**
- **GDAL** - `brew install gdal` on macOS (provides GDAL and GEOS libraries for
  GeoDjango)

## Getting Started

Setting up the project and starting the app:

```bash
# 1. Clone the repository
git clone https://github.com/<your-org>/walkie.git
cd walkie

# 2. Copy environment file and customize if needed
cp .env.example .env

# 3. Install Python dependencies
uv sync

# 4. Start PostGIS database
open -a Docker          # ensure Docker Desktop is running
docker compose up -d

# 5. Apply database migrations
uv run python backend/manage.py migrate

# 6. Start the backend (runs on http://localhost:8000)
uv run python backend/manage.py runserver

# 7. In a separate terminal, start the frontend (runs on http://localhost:3000)
cd frontend && npm install && npm run dev
```

To stop everything, run below commands:

```bash
# Stop the frontend and backend servers with Ctrl+C in their respective terminals

# Stop the database
docker compose down
```

## Configuration

See [docs/technical/configuration.md](docs/technical/configuration.md) for environment
variables, GDAL/GEOS paths, CORS settings, and PostGIS image details.

## Documentation

Full documentation lives in the [`docs/`](docs/) directory. See the
[table of contents](docs/index.md) for a complete listing.

- **Onboarding**
  - [overview](docs/onboarding/overview.md)
- **Technical**
  - [models](docs/technical/models.md)
  - [API](docs/technical/api-overview.md)
  - [route generation](docs/technical/route-generation.md)
  - [frontend](docs/technical/frontend-architecture.md)
  - [data pipeline](docs/technical/data-pipeline.md)
  - [configuration](docs/technical/configuration.md)
  - [user management](docs/technical/user-management.md)
  - [testing](docs/technical/testing.md)
- **User Guide**
  - [getting started](docs/user-guide/01-getting-started.md)
  - [exploring](docs/user-guide/02-exploring-regions.md)
  - [managing places](docs/user-guide/03-managing-places.md)
  - [generating routes](docs/user-guide/04-generating-routes.md)
  - [composing routes](docs/user-guide/05-composing-routes.md)
  - [managing routes](docs/user-guide/06-managing-routes.md)
  - [tracking progress](docs/user-guide/07-tracking-progress.md)
  - [settings](docs/user-guide/08-settings.md)
- **Reference**
  - [glossary](docs/glossary.md)
