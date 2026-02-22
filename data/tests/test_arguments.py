"""Tests for data.arguments module."""

from unittest.mock import patch

from data.arguments import parse_arguments


class TestParseArguments:
    """Tests for parse_arguments function."""

    def test_returns_expected_keys(self) -> None:
        """Parsed result contains expected argument keys."""
        arguments = [
            {"name": "--env", "help": "Environment name"},
            {"name": "--table", "help": "Table name"},
        ]
        with patch("sys.argv", ["prog", "--env", "dev", "--table", "users"]):
            result = parse_arguments(arguments)

        assert result == {"env": "dev", "table": "users"}

    def test_does_not_mutate_input(self) -> None:
        """Calling parse_arguments twice with the same list works (no mutation)."""
        arguments = [
            {"name": "--env", "help": "Environment name"},
        ]
        with patch("sys.argv", ["prog", "--env", "dev"]):
            first = parse_arguments(arguments)

        with patch("sys.argv", ["prog", "--env", "prod"]):
            second = parse_arguments(arguments)

        assert first == {"env": "dev"}
        assert second == {"env": "prod"}
        assert all("name" in arg for arg in arguments)
