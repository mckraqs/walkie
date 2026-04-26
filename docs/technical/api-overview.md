# API Overview

All endpoints require token authentication via the `Authorization: Token <token>`
header, except POST `/api/auth/login/`. Responses use JSON and GeoJSON formats where
applicable.

## Authentication

| Method | Path                | Description                                         |
| ------ | ------------------- | --------------------------------------------------- |
| POST   | `/api/auth/login/`  | Authenticate and receive a token (no auth required) |
| POST   | `/api/auth/logout/` | Delete the current auth token                       |
| GET    | `/api/auth/me/`     | Get the current user's info                         |

## Regions

| Method | Path                          | Description                                                                       |
| ------ | ----------------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/regions/`               | List all regions (without geometry)                                               |
| GET    | `/api/regions/favorites/`     | List the user's favorited regions                                                 |
| GET    | `/api/regions/{id}/`          | Get a single region as GeoJSON Feature                                            |
| POST   | `/api/regions/{id}/favorite/` | Add region to favorites                                                           |
| DELETE | `/api/regions/{id}/favorite/` | Remove region from favorites (deletes user's routes, walks, and places in region) |

## Paths

| Method | Path                                     | Description                                  |
| ------ | ---------------------------------------- | -------------------------------------------- |
| GET    | `/api/regions/{region_id}/paths/`        | List all paths in a region (GeoJSON)         |
| GET    | `/api/regions/{region_id}/segments/`     | List routable segments in a region (GeoJSON) |
| GET    | `/api/regions/{region_id}/paths/walked/` | Get walked path IDs and coverage counts      |

## Routes

| Method | Path                                                       | Description                      |
| ------ | ---------------------------------------------------------- | -------------------------------- |
| POST   | `/api/regions/{region_id}/routes/generate/`                | Generate a walking route         |
| GET    | `/api/regions/{region_id}/routes/saved/`                   | List saved routes                |
| POST   | `/api/regions/{region_id}/routes/saved/`                   | Save a new route                 |
| GET    | `/api/regions/{region_id}/routes/saved/{route_id}/`        | Load a saved route with segments |
| PATCH  | `/api/regions/{region_id}/routes/saved/{route_id}/`        | Rename a saved route             |
| DELETE | `/api/regions/{region_id}/routes/saved/{route_id}/`        | Delete a saved route             |
| GET    | `/api/regions/{region_id}/routes/saved/{route_id}/export/` | Export route as GPX or KML       |
| POST   | `/api/regions/{region_id}/routes/match-geometry/`          | Match drawn geometry to segments |

## Places

| Method | Path                                          | Description                       |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | `/api/regions/{region_id}/places/`            | List user's places in a region    |
| POST   | `/api/regions/{region_id}/places/`            | Create a new place                |
| PATCH  | `/api/regions/{region_id}/places/{place_id}/` | Update a place's name or location |
| DELETE | `/api/regions/{region_id}/places/{place_id}/` | Delete a place                    |

## Walks

| Method | Path                                          | Description                              |
| ------ | --------------------------------------------- | ---------------------------------------- |
| GET    | `/api/regions/{region_id}/walks/`             | List all walks in a region               |
| POST   | `/api/regions/{region_id}/walks/`             | Create a walk from route ID or geometry  |
| GET    | `/api/regions/{region_id}/walks/{walk_id}/`   | Retrieve a walk with full geometry       |
| PATCH  | `/api/regions/{region_id}/walks/{walk_id}/`   | Update walk name and/or date             |
| DELETE | `/api/regions/{region_id}/walks/{walk_id}/`   | Delete a walk                            |

## Restrictions and Limits

Routes, walks, places, walked paths, and route generation are restricted to the user's
favorited regions. Requests to these endpoints for non-favorited regions return a 403
Forbidden response.

Users can save a maximum of 25 routes per region.
