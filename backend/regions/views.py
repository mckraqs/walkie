"""Views for the regions app."""

from django.db.models import Exists, OuterRef, QuerySet
from rest_framework import generics

from regions.models import Region
from regions.serializers import RegionListItemSerializer, RegionSerializer


class RegionListView(generics.ListAPIView):
    """Return all regions as a flat JSON array without geometry."""

    serializer_class = RegionListItemSerializer
    pagination_class = None

    def get_queryset(self) -> QuerySet[Region]:
        """Return all regions annotated with the current user's favorite status."""
        from users.models import FavoriteRegion

        return (
            Region.objects.only(
                "id",
                "code",
                "name",
                "administrative_district_lvl_1",
                "administrative_district_lvl_2",
            )
            .annotate(
                _is_favorite=Exists(
                    FavoriteRegion.objects.filter(
                        user=self.request.user,
                        region=OuterRef("pk"),
                    )
                )
            )
            .order_by("administrative_district_lvl_1", "name")
        )


class RegionDetailView(generics.RetrieveAPIView):
    """Return a single region as a GeoJSON Feature."""

    serializer_class = RegionSerializer

    def get_queryset(self) -> QuerySet[Region]:
        """Return regions annotated with the current user's favorite status."""
        from users.models import FavoriteRegion

        return Region.objects.annotate(
            _is_favorite=Exists(
                FavoriteRegion.objects.filter(
                    user=self.request.user,
                    region=OuterRef("pk"),
                )
            )
        )
