"""URL configuration for the regions app."""

from django.urls import path

from paths.views import RegionPathsListView, RegionSegmentsListView
from places.views import PlaceDetailView, PlaceListCreateView
from regions.views import RegionDetailView, RegionListView
from routes.views import (
    RouteDetailView,
    RouteGenerateView,
    RouteListCreateView,
    RouteWalkToggleView,
)
from users.views import (
    FavoriteRegionListView,
    FavoriteRegionToggleView,
    PathWalkToggleView,
    WalkedPathsListView,
)

urlpatterns = [
    path("", RegionListView.as_view(), name="region-list"),
    path("favorites/", FavoriteRegionListView.as_view(), name="favorite-region-list"),
    path("<int:pk>/", RegionDetailView.as_view(), name="region-detail"),
    path(
        "<int:pk>/favorite/",
        FavoriteRegionToggleView.as_view(),
        name="region-favorite-toggle",
    ),
    path(
        "<int:region_id>/paths/",
        RegionPathsListView.as_view(),
        name="region-paths-list",
    ),
    path(
        "<int:region_id>/segments/",
        RegionSegmentsListView.as_view(),
        name="region-segments-list",
    ),
    path(
        "<int:region_id>/paths/walked/",
        WalkedPathsListView.as_view(),
        name="walked-paths-list",
    ),
    path(
        "<int:region_id>/paths/<int:path_id>/walk/",
        PathWalkToggleView.as_view(),
        name="path-walk-toggle",
    ),
    path(
        "<int:region_id>/places/",
        PlaceListCreateView.as_view(),
        name="place-list-create",
    ),
    path(
        "<int:region_id>/places/<int:place_id>/",
        PlaceDetailView.as_view(),
        name="place-detail",
    ),
    path(
        "<int:region_id>/routes/generate/",
        RouteGenerateView.as_view(),
        name="route-generate",
    ),
    path(
        "<int:region_id>/routes/saved/",
        RouteListCreateView.as_view(),
        name="route-list-create",
    ),
    path(
        "<int:region_id>/routes/saved/<int:route_id>/",
        RouteDetailView.as_view(),
        name="route-detail",
    ),
    path(
        "<int:region_id>/routes/saved/<int:route_id>/walk/",
        RouteWalkToggleView.as_view(),
        name="route-walk-toggle",
    ),
]
