# Walkie

A web application that generates curated walking routes based on user preferences.
Region-agnostic by design -- any area with operator-provided spatial data becomes
available for route generation.

## Overview

Walkie lets users set a starting point, choose preferences (duration, interests,
accessibility), and receive a walking route displayed on an interactive map. The app is
built for pleasant strolls, not cycling or driving navigation.

Spatial data (paths, points of interest, areas) is provided by operators through
standard geospatial formats. No city or region is hardcoded -- the system grows as new
datasets are uploaded.

## Tech Stack

- **Backend**: Django + Django REST Framework + GeoDjango
- **Frontend**: Next.js + Leaflet.js
- **Database**: PostgreSQL + PostGIS + pgRouting
- **Infrastructure**: Docker, GitHub Actions

## Prerequisites

- **Python 3.14+** (managed via [uv](https://docs.astral.sh/uv/))
- **Node.js 25+** / npm 11+
- **Docker Desktop**
- **GDAL** -- `brew install gdal` on macOS (provides GDAL and GEOS libraries for
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

See [docs/configuration.md](docs/configuration.md) for environment variables,
GDAL/GEOS paths, CORS settings, and PostGIS image details.

## Documentation

Additional documentation lives in the [`docs/`](docs/) directory:

- [Configuration](docs/configuration.md) -- environment variables, library paths, CORS,
  Docker image
- [Data Pipeline](docs/data-pipeline.md) -- geoportal processing script, CLI arguments,
  output schemas, management commands
- [Models](docs/models.md) -- Django models (`Region`, `Path`), fields, relationships
