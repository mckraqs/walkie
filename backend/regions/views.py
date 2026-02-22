"""Views for the regions app."""

from rest_framework import generics

from regions.models import Region
from regions.serializers import RegionSerializer


class RegionDetailView(generics.RetrieveAPIView):
    """Return a single region as a GeoJSON Feature."""

    queryset = Region.objects.all()
    serializer_class = RegionSerializer
