from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from app.repos.file import FileRepository
from tests.factories.file import FileCreateFactory


@pytest.mark.integration
class TestFileRepository:
    """Integration tests for FileRepository."""

    @pytest.fixture
    def file_repo(self, db_session: AsyncSession) -> FileRepository:
        return FileRepository(db_session)

    def _make_unique_storage_key(self, prefix: str = "test") -> str:
        """Generate a unique storage key for tests."""
        return f"{prefix}/{uuid4().hex[:8]}/file.txt"

    async def test_create_and_get_file(self, file_repo: FileRepository):
        """Test creating a file and retrieving it."""
        user_id = "test-user-file-create"
        storage_key = self._make_unique_storage_key()
        file_create = FileCreateFactory.build(
            user_id=user_id,
            storage_key=storage_key,
            original_filename="test.txt",
            content_type="text/plain",
            file_size=1024,
        )

        # Create
        created_file = await file_repo.create_file(file_create)
        assert created_file.id is not None
        assert created_file.user_id == user_id
        assert created_file.original_filename == "test.txt"
        assert created_file.storage_key == storage_key

        # Get by ID
        fetched_file = await file_repo.get_file_by_id(created_file.id)
        assert fetched_file is not None
        assert fetched_file.id == created_file.id

    async def test_get_file_by_storage_key(self, file_repo: FileRepository):
        """Test retrieving file by storage key."""
        user_id = "test-user-file-key"
        storage_key = self._make_unique_storage_key("key-test")
        file_create = FileCreateFactory.build(
            user_id=user_id,
            storage_key=storage_key,
        )

        await file_repo.create_file(file_create)

        fetched = await file_repo.get_file_by_storage_key(storage_key)
        assert fetched is not None
        assert fetched.storage_key == storage_key

        # Non-existent key
        not_found = await file_repo.get_file_by_storage_key("non/existent/key")
        assert not_found is None

    async def test_get_files_by_user(self, file_repo: FileRepository):
        """Test listing files for a user."""
        user_id = "test-user-file-list"

        # Create 3 files
        for i in range(3):
            await file_repo.create_file(
                FileCreateFactory.build(
                    user_id=user_id,
                    storage_key=self._make_unique_storage_key(f"list-{i}"),
                )
            )

        # Create file for another user
        await file_repo.create_file(
            FileCreateFactory.build(
                user_id="other-user",
                storage_key=self._make_unique_storage_key("other"),
            )
        )

        files = await file_repo.get_files_by_user(user_id)
        assert len(files) == 3
        for f in files:
            assert f.user_id == user_id

    async def test_get_files_by_user_with_scope_filter(self, file_repo: FileRepository):
        """Test filtering files by scope."""
        user_id = "test-user-file-scope"

        await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("public"),
                scope="public",
            )
        )
        await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("private"),
                scope="private",
            )
        )

        public_files = await file_repo.get_files_by_user(user_id, scope="public")
        assert len(public_files) == 1
        assert public_files[0].scope == "public"

    async def test_update_file(self, file_repo: FileRepository):
        """Test updating a file."""
        user_id = "test-user-file-update"
        created = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("update"),
                original_filename="old_name.txt",
            )
        )

        from app.models.file import FileUpdate

        update_data = FileUpdate(original_filename="new_name.txt")
        updated = await file_repo.update_file(created.id, update_data)

        assert updated is not None
        assert updated.original_filename == "new_name.txt"

        # Verify persistence
        fetched = await file_repo.get_file_by_id(created.id)
        assert fetched is not None
        assert fetched.original_filename == "new_name.txt"

    async def test_soft_delete_and_restore_file(self, file_repo: FileRepository):
        """Test soft delete and restore functionality."""
        user_id = "test-user-file-soft-delete"
        created = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("soft-del"),
            )
        )

        # Soft delete
        success = await file_repo.soft_delete_file(created.id)
        assert success is True

        fetched = await file_repo.get_file_by_id(created.id)
        assert fetched is not None
        assert fetched.is_deleted is True
        assert fetched.deleted_at is not None

        # Restore
        restored = await file_repo.restore_file(created.id)
        assert restored is True

        fetched = await file_repo.get_file_by_id(created.id)
        assert fetched is not None
        assert fetched.is_deleted is False
        assert fetched.deleted_at is None

    async def test_hard_delete_file(self, file_repo: FileRepository):
        """Test permanent file deletion."""
        user_id = "test-user-file-hard-delete"
        created = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("hard-del"),
            )
        )

        success = await file_repo.hard_delete_file(created.id)
        assert success is True

        fetched = await file_repo.get_file_by_id(created.id)
        assert fetched is None

    async def test_get_files_by_hash(self, file_repo: FileRepository):
        """Test deduplication lookup by file hash."""
        user_id = "test-user-file-hash"
        file_hash = "abc123def456"

        # Create 2 files with same hash
        await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("hash1"),
                file_hash=file_hash,
            )
        )
        await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("hash2"),
                file_hash=file_hash,
            )
        )

        files = await file_repo.get_files_by_hash(file_hash, user_id)
        assert len(files) == 2

    async def test_get_total_size_by_user(self, file_repo: FileRepository):
        """Test calculating total file size for a user."""
        user_id = "test-user-file-size"

        await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("size1"),
                file_size=1000,
            )
        )
        await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("size2"),
                file_size=2000,
            )
        )

        total_size = await file_repo.get_total_size_by_user(user_id)
        assert total_size == 3000

    async def test_get_file_count_by_user(self, file_repo: FileRepository):
        """Test counting files for a user."""
        user_id = "test-user-file-count"

        for i in range(4):
            await file_repo.create_file(
                FileCreateFactory.build(
                    user_id=user_id,
                    storage_key=self._make_unique_storage_key(f"count-{i}"),
                )
            )

        count = await file_repo.get_file_count_by_user(user_id)
        assert count == 4

    async def test_bulk_soft_delete_by_user(self, file_repo: FileRepository):
        """Test bulk soft delete with user validation."""
        user_id = "test-user-file-bulk-del"

        file1 = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("bulk1"),
            )
        )
        file2 = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("bulk2"),
            )
        )
        file3 = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("bulk3"),
            )
        )

        count = await file_repo.bulk_soft_delete_by_user(user_id, [file1.id, file2.id])
        assert count == 2

        # file3 should not be deleted
        fetched3 = await file_repo.get_file_by_id(file3.id)
        assert fetched3 is not None
        assert fetched3.is_deleted is False

    async def test_update_files_message_id(self, file_repo: FileRepository):
        """Test linking files to a message."""
        user_id = "test-user-file-msg-link"
        message_id = uuid4()

        file1 = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("msg1"),
                status="pending",
            )
        )
        file2 = await file_repo.create_file(
            FileCreateFactory.build(
                user_id=user_id,
                storage_key=self._make_unique_storage_key("msg2"),
                status="pending",
            )
        )

        count = await file_repo.update_files_message_id([file1.id, file2.id], message_id, user_id)
        assert count == 2

        # Verify files are linked and confirmed
        fetched1 = await file_repo.get_file_by_id(file1.id)
        assert fetched1 is not None
        assert fetched1.message_id == message_id
        assert fetched1.status == "confirmed"
