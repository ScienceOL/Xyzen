from polyfactory.factories.pydantic_factory import ModelFactory

from app.models.file import File, FileCreate


class FileFactory(ModelFactory[File]):
    """Factory for File model."""

    __model__ = File


class FileCreateFactory(ModelFactory[FileCreate]):
    """Factory for FileCreate schema."""

    __model__ = FileCreate

    scope = "private"
    category = "documents"
    is_deleted = False
    status = "pending"
    message_id = None
    folder_id = None
    metainfo = None
    file_hash = None
