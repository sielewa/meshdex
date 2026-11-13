class InvalidSearchQueryError(Exception):
    """The query or limit is outside what search accepts; the caller has to change it."""
