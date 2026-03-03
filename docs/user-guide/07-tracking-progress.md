# Tracking Progress

Walkie tracks which streets you have walked in each of your favorited regions.

## The Walked Counter

The header shows a badge with your progress: the number of walked streets out of the
total streets in the region, with a percentage.

## How Coverage is Calculated

A street is counted as "walked" when you have walked at least 50% of its total length.
Streets are identified by name - if multiple path records share the same street name,
they are evaluated together. Unnamed paths are evaluated individually.

## Marking Routes as Walked

Toggle the "walked" status on any saved route. When you mark a route as walked, the
paths covered by that route are recalculated and your counter updates.
