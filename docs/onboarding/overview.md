# Walkie Onboarding Overview

## What is Walkie

Walkie is a web application for generating curated walking routes in any geographic
region with available spatial data. Rather than forcing users into predefined walking
areas, Walkie is region-agnostic - any location with street and trail data becomes
a valid starting point for route generation. Users specify their preferences (desired
distance, route type like loop or one-way, optional start and end points), and Walkie
generates a walking route displayed on an interactive map.

The application is built specifically for pleasant strolls and neighborhood exploration.
It uses sophisticated routing algorithms (pgRouting's Dijkstra with randomized edge
costs) to avoid repetitive routes and encourage discovery. This is not a tool for
cycling, driving, or performance athletics - it prioritizes walkability, accessibility,
and leisurely pace.

Walkie persists user data including favorite regions, saved routes, user-defined places,
and a history of recorded walks. This allows users to build a personal map of explored
areas and revisit favorite routes.

## Architecture Overview

```text
┌─── Docker Compose ─────────────────────────┐
│                                             │
│  Browser (Next.js 16 / React 19)           │
│      |                                      │
│      | REST API (JSON + GeoJSON)            │
│      |                                      │
│  Django 6 + DRF + GeoDjango                │
│      |                                      │
│      | SQL + PostGIS + pgRouting            │
│      |                                      │
│  PostgreSQL 17                              │
│                                             │
└─────────────────────────────────────────────┘
```

## Tech Stack

| Technology               | Purpose                                  |
| ------------------------ | ---------------------------------------- |
| Python 3.14              | Backend language                         |
| Django 6 + DRF           | Web framework and REST API               |
| GeoDjango + PostGIS      | Spatial data handling and queries        |
| pgRouting                | Graph-based route generation (Dijkstra)  |
| Next.js 16 + React 19    | Frontend framework                       |
| TypeScript               | Frontend type safety                     |
| Leaflet                  | Interactive map rendering                |
| Tailwind CSS + shadcn/ui | Styling and component library            |
| PostgreSQL 17            | Primary database                         |
| Docker                   | Development environment containerization |
| uv                       | Python dependency management             |
| ruff                     | Linting and formatting                   |
| pyright                  | Static type checking                     |
| Vitest                   | Frontend testing                         |
| pytest                   | Backend testing                          |

## Project Structure

```text
walkie/
  backend/
    conftest.py          # Shared test fixtures
    manage.py
    paths/               # Path and Segment models, views, management commands
    places/              # Place model and views
    regions/             # Region model, views, URL routing hub
    routes/              # Route model, views, generation service
    users/               # FavoriteRegion model, auth views, walked paths
    walkie/              # Django project settings, root URL config
  frontend/
    src/
      app/               # Next.js pages (/ and /explore)
      components/        # React components (RegionExplorer, PathMap, SidePanel, etc.)
      contexts/          # AuthContext, ToastContext
      lib/               # API client, geo utilities, GPX/KML export
      test/              # Test setup and helpers
      types/             # TypeScript type definitions
  data/
    providers/           # Data pipeline scripts (geoportal.py)
    processed/           # Pipeline output files
    raw/                 # Raw input data
  docs/                  # Project documentation
```

## Getting Started for Developers

Refer to the README in the repository root for environment setup instructions, including
Python version, virtual environment creation, and database initialization.

When beginning work on Walkie:

- start by exploring the application via the `/explore` page to understand the user
  experience
- read the `models.py` files in each Django app (`paths`, `places`, `regions`, `routes`,
  `users`) to understand the data model and relationships
- for route generation features, examine `backend/routes/services.py` where the core
  routing algorithm is implemented. This is where edge cost randomization, selection,
  and segment stitching logic resides

## Key Concepts

**Region**: a geographic area defined by a boundary polygon. All features (paths,
routes, places) are scoped to a region. Users must favorite a region to access its
features

**Path**: A street or walkable trail loaded from geoportal data and stored as
a MultiLineString. Paths are the raw input; they are subdivided into routable Segments
during the noding process.

**Segment**: A routable sub-unit of a Path, split at every intersection. Each segment
has source and target topology nodes. Segments form the graph that pgRouting operates on
to compute shortest paths.

**Route**: A saved walking route with an ordered list of segment IDs, distance metadata,
and loop status. Routes are what users generate, save, name, and export.

**Walk**: A record of a completed walk, with its own geometry, walked date, and
distance. Walks are independent from routes and are the primary mechanism for tracking
walking progress. Created via GPX upload, drawing on the map, or from a saved route.

**Place**: A user-defined named location (point) within a region. Places serve as
optional start or end points for route generation, allowing users to save favorite
landmarks and quickly reference them.

For complete definitions and terminology, see the [Glossary](../glossary.md).
