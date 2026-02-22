"""URL configuration for the regions app."""

from django.urls import path

from paths.views import RegionPathsListView
from regions.views import RegionDetailView, RegionListView

urlpatterns = [
    path("", RegionListView.as_view(), name="region-list"),
    path("<int:pk>/", RegionDetailView.as_view(), name="region-detail"),
    path(
        "<int:region_id>/paths/",
        RegionPathsListView.as_view(),
        name="region-paths-list",
    ),
]
