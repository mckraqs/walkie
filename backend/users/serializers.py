"""Serializers for the users app."""

from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from rest_framework import serializers


class LoginSerializer(serializers.Serializer):
    """Validate login credentials."""

    username = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs: dict[str, str | User]) -> dict[str, str | User]:
        """Authenticate the user with the provided credentials.

        Args:
            attrs: Dictionary containing username and password.

        Returns:
            Validated data with the authenticated user added.

        Raises:
            ValidationError: If credentials are invalid.
        """
        username = attrs["username"]
        password = attrs["password"]
        user = authenticate(username=username, password=password)
        if user is None:
            raise serializers.ValidationError({"detail": "Invalid credentials."})
        attrs["user"] = user
        return attrs


class UserSerializer(serializers.ModelSerializer):
    """Serialize basic user information."""

    class Meta:
        """Meta options for UserSerializer."""

        model = User
        fields = ("id", "username")
