# Tracking Progress

Walkie tracks which streets you have walked in each of your favorited regions.

## The Walked Counter

The header shows a badge with your progress: the number of walked streets out of the
total streets in the region, with a percentage.

## How Coverage is Calculated

A street is counted as "walked" when you have walked at least 50% of its total length.
Streets are identified by name -- if multiple path records share the same street name,
they are evaluated together. Unnamed paths are evaluated individually.

Coverage is derived from Walk records. Each walk's geometry is matched to street
segments at creation time.

## Walk History

The "My Walks" section in the side panel lists all your recorded walks, showing each
walk's name, date, and distance.

- **Click a walk** to highlight its geometry on the map. The map zooms to fit the walk.
- **Click it again** to deselect. The map stays at its current view.
- **Click the pencil icon** to open an edit dialog where you can change the walk's name
  and date, or delete the walk.

## Adding a Walk

Click **+ Add Walk** in the Walk History section. Three options are available:

### From Saved Route

Select an existing saved route, give the walk a name, and pick the date. The walk uses
the route's geometry.

### Draw on Map

Click points on the map to draw the walk's path. As you draw, the app matches your line
to nearby street segments and shows the matched distance. When done, click
**Save Walk**, enter a name and date, and confirm.

### Upload GPX

Select a `.gpx` file exported from a GPS device (Apple Watch, Garmin, etc.). The file
is parsed in your browser and simplified to reduce point density while preserving the
shape of the track. A confirmation line shows how many points were loaded and how many
remain after simplification. Enter a name and date, then click **Create Walk**.
