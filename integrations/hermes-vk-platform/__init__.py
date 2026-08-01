"""VK Messenger platform plugin for Hermes Agent."""


def register(ctx):
    """Load the Hermes-dependent adapter only when the plugin is activated."""
    try:
        from .adapter import register as register_adapter
    except ImportError:  # Allows pytest to import this directory as a flat test root.
        from adapter import register as register_adapter  # type: ignore
    return register_adapter(ctx)


__all__ = ["register"]
