"""
Literature search utilities for multi-source academic literature retrieval
"""

from .base_client import BaseLiteratureClient
from .doi_cleaner import deduplicate_by_doi, normalize_doi
from .models import LiteratureWork, SearchRequest
from .work_distributor import WorkDistributor

__all__ = [
    "BaseLiteratureClient",
    "normalize_doi",
    "deduplicate_by_doi",
    "SearchRequest",
    "LiteratureWork",
    "WorkDistributor",
]
