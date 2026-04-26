# Frontend Architecture

## Tech Stack

### Framework and Runtime

- **Next.js 16** with App Router for server-side rendering, static generation, and API
  routes
- **React 19** for component model and UI rendering
- **TypeScript** for type safety and developer experience

### Styling and Components

- **Tailwind CSS 4** for utility-first CSS styling
- **shadcn/ui** component library built on Radix UI primitives for accessible, unstyled
  components
- **Leaflet** (via react-leaflet) for interactive map rendering and GIS operations

### User Feedback

- **Sonner** for toast notifications and user messaging

### Testing

- **Vitest** for unit and integration testing
- **Testing Library** for component testing with user-centric queries

## Page Structure

### Home Page (`/`)

The home page redirects to `/explore`. It contains no UI of its own.

### Explore Page (`/explore`)

The explore page is the main application interface. When unauthenticated, it displays
a login form with the app title and a theme toggle. When authenticated, layout includes:

- **Header bar** with district filter dropdown, region selector dropdown, favorite
  toggle, walked counter badge, username, logout button, and theme toggle
- **Full-height interactive map** showing region boundaries, paths (with hover tooltips
  showing distance in km), routes, segments (in compose mode), and places
- **Right-side collapsible panel** for places, saved routes, route composition,
  route planning, and path list

## Component Hierarchy

```text
RootLayout
  ThemeProvider
    AuthProvider
      ToastProvider
        Home (/)
          redirect("/explore")
        ExplorePage (/explore)
          LoginForm (unauthenticated)
          ThemeToggle
          RegionExplorer (authenticated)
            SidePanel
              Places (embeds PlaceSearch)
              WalkHistory
              SavedRoutes
              RoutePlanner
              PathList
            PathMap (dynamic import, SSR disabled)
              FitToWalk
            PlaceNameDialog
            ConfirmDialog
            AddWalkDialog
            EditWalkDialog
            UploadGpxDialog
```

### Component Descriptions

**RootLayout** Root layout component wrapping the entire application. Handles meta tags,
fonts, and global styles.

**ThemeProvider** Context provider managing light/dark theme state. Persists user
preference to localStorage.

**AuthProvider** Context provider managing user authentication state, token persistence,
and login/logout logic.

**ToastProvider** Context provider wrapping Sonner's toast system for application-wide
notifications.

**Home** Redirect component. Navigates to `/explore`.

**ExplorePage** Main application page. Renders LoginForm when unauthenticated. When
authenticated, manages region state and distributes it to child components.

**RegionExplorer** Container component coordinating map and side panel. Manages route
data, composing state, and segment selection.

**SidePanel** Collapsible section container with sections for Places, SavedRoutes,
RoutePlanner, and PathList.

**PathMap** Dynamic Leaflet map component with handlers for place creation, segment
selection, point picking, and path hover tooltips (showing name, distance in km,
category, surface, and lit status). Server-side rendering disabled.

**RoutePlanner** Unified panel for route generation and manual composition. In initial
mode, shows the generation form (distance, route type, start/end points) and a "Start
Composing" button. In composing mode, shows segment stats, undo/clear controls, and
save flow. In results mode, shows generated route details with save/download/clear.

**SavedRoutes** List of user-saved routes with options to load, rename, delete, and
export as GPX or KML.

**WalkHistory** List of recorded walks showing name, date, and distance. Each walk has
an edit button opening a dialog for name/date changes or deletion. The "+ Add Walk"
dropdown offers three creation flows: from saved route, draw on map, or upload GPX.

**AddWalkDialog** Modal dialog for creating a walk from a saved route. Select a route,
provide a name and date.

**EditWalkDialog** Modal dialog for editing a walk's name and date, with a delete
button.

**UploadGpxDialog** Modal dialog for creating a walk from a GPX file. Parses the file
client-side with Douglas-Peucker simplification, shows a point count confirmation line,
and collects name and date.

**FitToWalk** Internal PathMap component that zooms the map to fit the selected walk's
geometry using animated flyToBounds.

**Places** List of saved places with options to create (pin on map or search), rename,
delete, and use as route endpoints. Embeds `PlaceSearch` inline when search mode is
active.

**PlaceSearch** Search interface for finding addresses and locations via Photon
geocoding API. Embedded within the Places component, not a standalone panel section.

## State Management

### AuthContext

Manages user authentication throughout the application.

**State:**

- `user` - authenticated user object with `id`, `username`, and `token`
- `loading` - boolean indicating if authentication check is in progress

**Methods:**

- `login(username: string, password: string)` -- authenticates user and stores token in
  localStorage
- `logout()` - clears user state and removes token from localStorage

Token persisted in localStorage as `authToken` with automatic restoration on app load.

Automatic 401 handling: if any API request returns 401, the token is cleared and user is
redirected to home page.

### ToastContext

Wraps Sonner's toast notification system.

**Methods:**

- `showToast(message: string, type: 'success' | 'error' | 'info')`
  - displays a notification

### ExplorePage Lifted State

Lifted from ExplorePage and passed down as props:

- `selectedRegionId` - currently selected region
- `walkedPathIds` - set of path IDs marked as walked
- `places` - array of saved places in region
- `districtFilter` - currently selected district
- `isFavorited` - whether current region is favorited

### RegionExplorer Lifted State

Lifted from RegionExplorer and distributed to SidePanel and PathMap:

- `routes` - array of saved routes
- `generatedRoute` - current generated or composed route (GeoJSON)
- `isComposing` - boolean indicating if in compose mode
- `selectedSegments` - set of selected segment IDs in compose mode
- `pointPickingMode` - 'start' | 'end' | null for route generation
- `loading` - boolean indicating if data is loading
- `walks` - array of recorded walks
- `activeWalkId` - currently selected walk ID
- `activeWalkGeometry` - geometry of the selected walk for map display
- `drawingForWalk` - boolean indicating if drawing mode is for a walk
- `focusWalkKey` - counter that triggers map zoom to selected walk

## API Client (`src/lib/api.ts`)

Centralized HTTP client for all backend communication.

### Features

**Token-based authentication:** All requests include `Authorization: Token <token>`
header using token from AuthContext.

**Automatic 401 handling:** If any request returns 401 Unauthorized, the AuthProvider
clears the token and redirects to home page.

**Request/response handling:** Wraps `fetch()` API with consistent error handling and
response parsing.

### Endpoints

**Authentication:**

- `POST /api/auth/login` - authenticates user and returns token

**Regions:**

- `GET /api/regions/` - lists all regions grouped by district
- `POST /api/regions/{id}/favorite/` - adds region to user's favorites
- `DELETE /api/regions/{id}/favorite/` - removes region from favorites

**Routes:**

- `GET /api/regions/{region_id}/routes/saved/` - lists saved routes in region
- `POST /api/regions/{region_id}/routes/saved/` - creates new route
- `PATCH /api/regions/{region_id}/routes/saved/{route_id}/` - renames route
- `DELETE /api/regions/{region_id}/routes/saved/{route_id}/` - deletes route
- `POST /api/regions/{region_id}/routes/match-geometry/` - matches drawn geometry to
  segments

**Walks:**

- `GET /api/regions/{region_id}/walks/` - lists walks in region
- `POST /api/regions/{region_id}/walks/` - creates walk from route ID or geometry
- `GET /api/regions/{region_id}/walks/{walk_id}/` - retrieves walk with geometry
- `PATCH /api/regions/{region_id}/walks/{walk_id}/` - updates walk name and/or date
- `DELETE /api/regions/{region_id}/walks/{walk_id}/` - deletes walk

**Paths:**

- `GET /api/regions/{region_id}/paths/` - lists all paths in region
- `GET /api/regions/{region_id}/paths/walked/` - lists walked paths with coverage counts

**Places:**

- `GET /api/regions/{region_id}/places/` - lists saved places in region
- `POST /api/regions/{region_id}/places/` - creates new place
- `PATCH /api/regions/{region_id}/places/{place_id}/` - renames a place
- `DELETE /api/regions/{region_id}/places/{place_id}/` - deletes place

**Geocoding:** Photon API (komoot.io) for address search - no authentication required.

- `GET https://photon.komoot.io/api/` - forward geocoding search

## Map Integration

### Leaflet and react-leaflet

The PathMap component uses Leaflet for interactive mapping with react-leaflet bindings.
Imported dynamically with `next/dynamic` and `{ ssr: false }` to prevent server-side
rendering issues with browser APIs.

### Map Layers

The map renders the following GIS layers:

**Region boundary:** Polygon layer displaying the administrative boundary of the
selected region.

**Paths:** Polyline layer showing all streets and walking paths. Color and styling
change based on walked status and current filters.

**Route:** Highlighted polyline showing the currently selected route (generated,
composed, or saved). Distinct color and styling for visibility.

**Segments:** Polyline layer visible only in compose mode. Shows individual street
segments (edges between intersections) with distinct styling.

**Places:** Marker layer showing saved places. Each marker includes a popup with place
name and options.

**Walk geometry:** Polyline displaying the selected walk's path when a walk is active in
Walk History. Styled distinctly from routes.

**Drawn walk/route:** Polyline showing vertices placed by the user in draw mode, with
matched segments highlighted.

**Temporary points:** Markers for points being picked for route start/end or place
creation.

### Click Handlers

**Place creation:** In place creation mode, clicking the map captures coordinates,
displays a dialog for place name entry, and saves the place.

**Segment selection (compose mode):** Clicking a segment in compose mode toggles its
selection. Connected segments extend the route; disconnected segments prompt
confirmation before adding.

**Point picking (route generation):** Clicking the map while in point picking mode
(start or end point) captures coordinates and displays options to use once or save as
place.

**Walk/route drawing:** In draw mode, clicking the map places vertices that form
a LineString. The geometry is sent to the match-geometry endpoint (debounced) to show
matched segments and distance in real time.

## Utility Modules

### `src/lib/geo.ts`

Geographic calculations and transformations.

**Functions:**

- **formatDistance** -- formats a distance in meters as a human-readable string (km or
  m)
- **haversineDistance** -- computes great-circle distance between two [lon, lat] points
  in meters
- **getRouteEndpoints** -- traces a chain of segment IDs to determine the start and end
  topology nodes
- **getEndpointCoords** -- extracts the geographic [lon, lat] coordinates of a segment
  chain's start and end points

### `src/lib/gpx.ts`

GPX/KML export and GPX import utilities.

**Export functions:**

- **stitchCoordinates** -- merges ordered GeoJSON LineString features into a single
  coordinate array, handling segment reversal and junction point deduplication
- **buildGpxString** -- generates GPX 1.1 XML from a route name and coordinates
- **buildKmlString** -- generates KML 2.2 XML from a route name and coordinates
- **downloadRouteFile** -- stitches route segments, builds GPX or KML content, and
  triggers a browser file download

**Import functions (used by GPX upload):**

- **parseGpx** -- parses GPX XML via DOMParser, extracts [lon, lat] coordinates from all
  trackpoints across all tracks and track segments
- **douglasPeucker** -- Douglas-Peucker line simplification using perpendicular distance
  in approximate meters
- **parseAndSimplifyGpx** -- combines parsing and simplification, returns raw point
  count, simplified count, and the resulting coordinates

## UI Component Library

shadcn/ui components (built on Radix UI primitives) located in `src/components/ui/`:

- **Button** - clickable button with variants (primary, secondary, ghost, destructive)
- **Select** - dropdown selector with search and grouping
- **Badge** - label or tag component
- **Dialog** - modal dialog for confirmation or input
- **Input** - text input field
- **Label** - form label component
- **Slider** - range slider for numeric input
- **Tooltip** - hover tooltip for additional information
- **Collapsible** - expandable/collapsible section
- **ScrollArea** - scrollable container with custom scrollbar styling

## Collapsible Side Panels

The SidePanel component provides a tabbed interface with collapsible sections for
different features:

- **Places** - manage saved places with integrated search (pin on map or search for
  addresses)
- **Walk History** - view, add, edit, and delete recorded walks; add walks from saved
  routes, by drawing on the map, or by uploading GPX files
- **Saved Routes** - view, manage, and export saved routes
- **Route Planner** - generate walking routes or manually compose routes by selecting
  segments (switches between generation form, composing mode, and results mode)
- **Path List** - browse all paths in the region (hover highlights on map, click zooms
  to path)

Each section uses the Collapsible component from shadcn/ui for expand/collapse
functionality. Sections maintain independent open/close state. Only one section can be
expanded at a time (optional accordion behavior).

State for active section is lifted to RegionExplorer and passed as props to SidePanel.
