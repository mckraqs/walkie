"""Views for the paths app."""

from django.db.models import QuerySet
from rest_framework import generics

from paths.models import Path
from paths.serializers import PathSerializer


class RegionPathsListView(generics.ListAPIView):
    """Return all paths in a region as a GeoJSON FeatureCollection."""

    serializer_class = PathSerializer

    def get_queryset(self) -> QuerySet[Path]:
        """Filter paths by region_id from URL kwargs."""
        return Path.objects.filter(region_id=self.kwargs["region_id"])
