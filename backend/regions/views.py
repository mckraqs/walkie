"""Views for the regions app."""

from rest_framework import generics

from regions.models import Region
from regions.serializers import RegionListItemSerializer, RegionSerializer


class RegionListView(generics.ListAPIView):
    """Return all regions as a flat JSON array without geometry."""

    queryset = Region.objects.only(
        "id",
        "code",
        "name",
        "administrative_district_lvl_1",
        "administrative_district_lvl_2",
    ).order_by("administrative_district_lvl_1", "name")
    serializer_class = RegionListItemSerializer
    pagination_class = None


class RegionDetailView(generics.RetrieveAPIView):
    """Return a single region as a GeoJSON Feature."""

    queryset = Region.objects.all()
    serializer_class = RegionSerializer
