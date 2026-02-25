"""Views for the paths app."""

from django.contrib.gis.db.models.functions import Length
from django.db.models import QuerySet
from rest_framework import generics

from paths.models import Path, Segment
from paths.serializers import PathSerializer, SegmentSerializer


class RegionPathsListView(generics.ListAPIView):
    """Return all paths in a region as a GeoJSON FeatureCollection."""

    serializer_class = PathSerializer

    def get_queryset(self) -> QuerySet[Path]:
        """Filter paths by region_id from URL kwargs."""
        return Path.objects.filter(region_id=self.kwargs["region_id"])


class RegionSegmentsListView(generics.ListAPIView):
    """Return all routable segments in a region as a GeoJSON FeatureCollection."""

    serializer_class = SegmentSerializer

    def get_queryset(self) -> QuerySet[Segment]:
        """Filter segments by region_id, excluding non-routable ones.

        Annotates each segment with its spheroid-accurate length in meters.
        """
        return Segment.objects.filter(
            region_id=self.kwargs["region_id"],
            source__isnull=False,
            target__isnull=False,
        ).annotate(length=Length("geometry", spheroid=True))
