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

The home page is the entry point to Walkie. It serves two different experiences based on
authentication status:

**Unauthenticated state:**

- Login form with username and password fields
- Theme toggle in the top-right corner

**Authenticated state:**

- Username displayed in the top-right corner
- "Browse regions" button to navigate to the explore page
- "Logout" button
- Theme toggle in the top-right corner

### Explore Page (`/explore`)

The explore page is the main application interface. Layout includes:

- **Header bar** with district filter dropdown, region selector dropdown, favorite
  toggle, and walked counter badge
- **Full-height interactive map** showing region boundaries, paths, routes, segments (in
  compose mode), and places
- **Left-side collapsible panel** for route planning, route composition, saved routes,
  path list, places, and place search
- **Theme toggle** in the top-right corner

## Component Hierarchy

```text
RootLayout
  ThemeProvider
    AuthProvider
      ToastProvider
        Home (/)
          LoginForm
          ThemeToggle
        ExplorePage (/explore)
          RegionExplorer
            SidePanel
              RoutePlanner
              RouteComposer
              SavedRoutes
              PathList
              Places
              PlaceSearch
            PathMap (dynamic import, SSR disabled)
              PlaceNameDialog
              ConfirmDialog
          ThemeToggle
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

**Home** Login page component. Renders LoginForm for unauthenticated users or browse
button and user info for authenticated users.

**ExplorePage** Main application page. Manages region state and distributes it to child
components.

**RegionExplorer** Container component coordinating map and side panel. Manages route
data, composing state, and segment selection.

**SidePanel** Collapsible section container with tabs for RoutePlanner, RouteComposer,
SavedRoutes, PathList, Places, and PlaceSearch.

**PathMap** Dynamic Leaflet map component with handlers for place creation, segment
selection, and point picking. Server-side rendering disabled.

**RoutePlanner** Form component for generating routes. Manages distance slider, route
type selection, start/end point picking.

**RouteComposer** Interface for manually selecting and connecting segments on the map to
build custom routes.

**SavedRoutes** List of user-saved routes with options to load, rename, mark as walked,
delete, and export.

**Places** List of saved places with options to create, delete, and use as route
endpoints.

**PlaceSearch** Search interface for finding addresses and locations via Photon
geocoding API.

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

- `GET /api/regions` - lists all regions grouped by district
- `POST /api/regions/{id}/favorite` - adds region to user's favorites
- `DELETE /api/regions/{id}/favorite` - removes region from favorites

**Routes:**

- `GET /api/regions/{id}/routes` - lists saved routes in region
- `POST /api/regions/{id}/routes` - creates new route
- `PUT /api/routes/{id}` - updates route name or walked status
- `DELETE /api/routes/{id}` - deletes route

**Paths:**

- `GET /api/regions/{id}/paths` - lists all paths in region
- `GET /api/regions/{id}/walked-paths` - lists walked paths with coverage percentage

**Places:**

- `GET /api/regions/{id}/places` - lists saved places in region
- `POST /api/regions/{id}/places` - creates new place
- `DELETE /api/places/{id}` - deletes place

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

## Utility Modules

### `src/lib/geo.ts`

Geographic calculations and transformations.

**Functions:**

`formatDistance(meters: number): string` Converts meters to human-readable format
(kilometers or meters with appropriate precision).

`haversineDistance(coord1: [number, number], coord2: [number, number]): number`
Calculates great-circle distance between two coordinates in meters using the Haversine
formula.

`getRouteEndpoints(route: GeoJSON): [number, number][]` Returns start and end
coordinates of a route linestring.

`getEndpointCoords(segments: Segment[], direction: 'start' | 'end'): [number, number]`
Traverses a chain of connected segments to find the endpoint in a given direction.

### `src/lib/gpx.ts`

GPX and KML file generation for route export.

**Functions:**

`stitchCoordinates(segments: Segment[]): number[][]` Merges coordinates from connected
segments into a continuous array, handling direction reversals.

`generateGPX(route: GeoJSON, metadata?: RouteMetadata): string` Generates GPX 1.1 XML
document from route geometry. Includes optional route name, description, and waypoint
data.

`generateKML(route: GeoJSON, metadata?: RouteMetadata): string` Generates KML 2.2 XML
document from route geometry for Google Earth compatibility.

`downloadRouteFile(content: string, filename: string, mimeType: string): void` Triggers
browser download of generated file (GPX or KML).

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

- **Route Planner** - generate walking routes by distance and type
- **Route Composer** - manually build routes by selecting segments
- **Saved Routes** - view, manage, and export saved routes
- **Path List** - browse all paths in the region
- **Places** - manage saved places
- **Place Search** - search for addresses and locations

Each section uses the Collapsible component from shadcn/ui for expand/collapse
functionality. Sections maintain independent open/close state. Only one section can be
expanded at a time (optional accordion behavior).

State for active section is lifted to RegionExplorer and passed as props to SidePanel.
