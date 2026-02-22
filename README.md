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

## Development

*To be documented as the project takes shape.*
