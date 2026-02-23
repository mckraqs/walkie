"""URL configuration for the regions app."""

from django.urls import path

from paths.views import RegionPathsListView
from regions.views import RegionDetailView, RegionListView
from routes.views import RouteGenerateView
from users.views import FavoriteRegionListView, FavoriteRegionToggleView

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
        "<int:region_id>/routes/generate/",
        RouteGenerateView.as_view(),
        name="route-generate",
    ),
]
