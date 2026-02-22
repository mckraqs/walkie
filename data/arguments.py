"""Utility functions for parsing arguments."""

import argparse
from collections.abc import Iterable
from typing import Any


def parse_arguments(app_arguments: Iterable[dict[str, Any]]) -> dict[str, Any]:
    """Parse the arguments and return a dictionary of arguments.

    Args:
        app_arguments: List of dictionaries containing argument name and kwargs.
            Example: [
            {
                "name": "--environment",
                "help": "Environment name, e.g. dev, prod, etc."
            },
            {
                "name": "--table_name",
                "help": "Name of the table."
            },
        ]
    """
    parser = argparse.ArgumentParser()
    for argument_dict in app_arguments:
        kwargs = {k: v for k, v in argument_dict.items() if k != "name"}
        parser.add_argument(argument_dict["name"], **kwargs)
    return vars(parser.parse_args())
