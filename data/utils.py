"""Utility functions for logging."""

import logging


class DefaultSingleLineFormatter(logging.Formatter):
    """Default single line formatter for logging."""

    def format(self, record: logging.LogRecord) -> str:
        """Format the log record as a single line string.

        Args:
            record (logging.LogRecord): log record to format

        Returns:
            str: Formatted log record as a single line string.
        """
        return " - ".join(
            [
                self.formatTime(record),
                record.name,
                record.levelname,
                str(record.msg),
            ]
        )


def setup_logger(name: str, level: int = logging.INFO) -> logging.Logger:
    """Set up logger with provided name and level.

    Args:
        name (str): name of the logger
        level (int, optional): logging level. Defaults to logging.INFO.

    Returns:
        logging.Logger: logger object
    """
    logger = logging.getLogger(name)
    logger.setLevel(level)

    # Avoid adding duplicate handlers
    if logger.hasHandlers():
        logger.handlers.clear()

    handler = logging.StreamHandler()
    handler.setFormatter(DefaultSingleLineFormatter())

    logger.addHandler(handler)
    logger.propagate = False

    return logger
