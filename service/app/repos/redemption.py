import logging
from uuid import UUID

from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.redemption import (
    RedemptionCode,
    RedemptionCodeCreate,
    RedemptionCodeUpdate,
    RedemptionHistory,
    RedemptionHistoryCreate,
    UserWallet,
    UserWalletCreate,
    UserWalletUpdate,
)

logger = logging.getLogger(__name__)


class RedemptionRepository:
    """Redemption code and wallet data access layer"""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== RedemptionCode Operations ====================
    async def create_redemption_code(self, code_data: RedemptionCodeCreate) -> RedemptionCode:
        """
        Creates a new redemption code.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            code_data: The Pydantic model containing the data for the new code.

        Returns:
            The newly created RedemptionCode instance.
        """
        logger.debug(f"Creating new redemption code: {code_data.code}")

        code = RedemptionCode(**code_data.model_dump())
        self.db.add(code)
        await self.db.flush()
        await self.db.refresh(code)

        logger.info(f"Created redemption code: {code.id}, code: {code.code}, amount: {code.amount}")
        return code

    async def get_redemption_code_by_id(self, code_id: UUID) -> RedemptionCode | None:
        """
        Fetches a redemption code by its ID.

        Args:
            code_id: The UUID of the code to fetch.

        Returns:
            The RedemptionCode, or None if not found.
        """
        logger.debug(f"Fetching redemption code with id: {code_id}")
        result = await self.db.exec(select(RedemptionCode).where(RedemptionCode.id == code_id))
        return result.one_or_none()

    async def get_redemption_code_by_code(self, code: str) -> RedemptionCode | None:
        """
        Fetches a redemption code by its code string.

        Args:
            code: The code string to search for.

        Returns:
            The RedemptionCode, or None if not found.
        """
        logger.debug(f"Fetching redemption code with code: {code}")
        result = await self.db.exec(select(RedemptionCode).where(RedemptionCode.code == code))
        return result.one_or_none()

    async def update_redemption_code(self, code_id: UUID, code_data: RedemptionCodeUpdate) -> RedemptionCode | None:
        """
        Updates an existing redemption code.
        This function does NOT commit the transaction.

        Args:
            code_id: The UUID of the code to update.
            code_data: The Pydantic model containing the update data.

        Returns:
            The updated RedemptionCode instance, or None if not found.
        """
        logger.debug(f"Updating redemption code with id: {code_id}")
        code = await self.db.get(RedemptionCode, code_id)
        if not code:
            return None

        update_data = code_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(code, key):
                setattr(code, key, value)

        self.db.add(code)
        await self.db.flush()
        await self.db.refresh(code)

        logger.info(f"Updated redemption code: {code.id}")
        return code

    async def increment_code_usage(self, code_id: UUID) -> RedemptionCode | None:
        """
        Increments the current_usage of a redemption code.
        This function does NOT commit the transaction.

        Args:
            code_id: The UUID of the code to increment.

        Returns:
            The updated RedemptionCode instance, or None if not found.
        """
        logger.debug(f"Incrementing usage for redemption code: {code_id}")
        code = await self.db.get(RedemptionCode, code_id)
        if not code:
            return None

        code.current_usage += 1
        self.db.add(code)
        await self.db.flush()
        await self.db.refresh(code)

        logger.info(f"Incremented usage for code {code.id}, current_usage: {code.current_usage}")
        return code

    async def list_redemption_codes(
        self, limit: int = 100, offset: int = 0, is_active: bool | None = None
    ) -> list[RedemptionCode]:
        """
        List redemption codes with optional filtering.

        Args:
            limit: Maximum number of codes to return.
            offset: Number of codes to skip.
            is_active: Filter by active status (None means no filter).

        Returns:
            List of RedemptionCode instances ordered by creation time (desc).
        """
        logger.debug(f"Listing redemption codes, limit: {limit}, offset: {offset}, is_active: {is_active}")
        query = select(RedemptionCode)
        if is_active is not None:
            query = query.where(RedemptionCode.is_active == is_active)
        query = query.order_by(col(RedemptionCode.created_at).desc()).limit(limit).offset(offset)

        result = await self.db.exec(query)
        codes = list(result.all())
        logger.debug(f"Found {len(codes)} redemption codes")
        return codes

    # ==================== RedemptionHistory Operations ====================
    async def create_redemption_history(self, history_data: RedemptionHistoryCreate) -> RedemptionHistory:
        """
        Creates a new redemption history record.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            history_data: The Pydantic model containing the data for the new history record.

        Returns:
            The newly created RedemptionHistory instance.
        """
        logger.debug(f"Creating redemption history for user: {history_data.user_id}, code: {history_data.code_id}")

        history = RedemptionHistory(**history_data.model_dump())
        self.db.add(history)
        await self.db.flush()
        await self.db.refresh(history)

        logger.info(f"Created redemption history: {history.id}")
        return history

    async def get_user_redemption_history(
        self, user_id: str, limit: int = 100, offset: int = 0
    ) -> list[RedemptionHistory]:
        """
        Get redemption history for a specific user.

        Args:
            user_id: The user ID to fetch history for.
            limit: Maximum number of records to return.
            offset: Number of records to skip.

        Returns:
            List of RedemptionHistory instances ordered by redeemed time (desc).
        """
        logger.debug(f"Fetching redemption history for user: {user_id}")
        result = await self.db.exec(
            select(RedemptionHistory)
            .where(RedemptionHistory.user_id == user_id)
            .order_by(col(RedemptionHistory.redeemed_at).desc())
            .limit(limit)
            .offset(offset)
        )
        history = list(result.all())
        logger.debug(f"Found {len(history)} redemption history records for user {user_id}")
        return history

    async def get_code_redemption_history(
        self, code_id: UUID, limit: int = 100, offset: int = 0
    ) -> list[RedemptionHistory]:
        """
        Get redemption history for a specific code.

        Args:
            code_id: The code ID to fetch history for.
            limit: Maximum number of records to return.
            offset: Number of records to skip.

        Returns:
            List of RedemptionHistory instances ordered by redeemed time (desc).
        """
        logger.debug(f"Fetching redemption history for code: {code_id}")
        result = await self.db.exec(
            select(RedemptionHistory)
            .where(RedemptionHistory.code_id == code_id)
            .order_by(col(RedemptionHistory.redeemed_at).desc())
            .limit(limit)
            .offset(offset)
        )
        history = list(result.all())
        logger.debug(f"Found {len(history)} redemption history records for code {code_id}")
        return history

    async def check_user_redeemed_code(self, user_id: str, code_id: UUID) -> bool:
        """
        Check if a user has already redeemed a specific code.

        Args:
            user_id: The user ID to check.
            code_id: The code ID to check.

        Returns:
            True if the user has redeemed this code, False otherwise.
        """
        logger.debug(f"Checking if user {user_id} has redeemed code {code_id}")
        result = await self.db.exec(
            select(RedemptionHistory).where(
                RedemptionHistory.user_id == user_id,
                RedemptionHistory.code_id == code_id,
            )
        )
        history = result.first()
        has_redeemed = history is not None
        logger.debug(f"User {user_id} has {'already' if has_redeemed else 'not'} redeemed code {code_id}")
        return has_redeemed

    # ==================== UserWallet Operations ====================
    async def create_user_wallet(self, wallet_data: UserWalletCreate) -> UserWallet:
        """
        Creates a new user wallet.
        This function does NOT commit the transaction, but it does flush the session.

        Args:
            wallet_data: The Pydantic model containing the data for the new wallet.

        Returns:
            The newly created UserWallet instance.
        """
        logger.debug(f"Creating new wallet for user: {wallet_data.user_id}")

        wallet = UserWallet(**wallet_data.model_dump())
        self.db.add(wallet)
        await self.db.flush()
        await self.db.refresh(wallet)

        logger.info(f"Created wallet for user {wallet.user_id}")
        return wallet

    async def get_user_wallet(self, user_id: str) -> UserWallet | None:
        """
        Fetches a user's wallet.

        Args:
            user_id: The user ID to fetch wallet for.

        Returns:
            The UserWallet, or None if not found.
        """
        logger.debug(f"Fetching wallet for user: {user_id}")
        result = await self.db.exec(select(UserWallet).where(UserWallet.user_id == user_id))
        return result.one_or_none()

    async def get_or_create_user_wallet(self, user_id: str) -> UserWallet:
        """
        Gets or creates a user wallet if it doesn't exist.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID to get or create wallet for.

        Returns:
            The UserWallet instance.
        """
        logger.debug(f"Getting or creating wallet for user: {user_id}")
        wallet = await self.get_user_wallet(user_id)
        if wallet is None:
            wallet_data = UserWalletCreate(user_id=user_id, virtual_balance=0, total_credited=0, total_consumed=0)
            wallet = await self.create_user_wallet(wallet_data)
            logger.info(f"Created new wallet for user {user_id}")
        return wallet

    async def update_user_wallet(self, user_id: str, wallet_data: UserWalletUpdate) -> UserWallet | None:
        """
        Updates an existing user wallet.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID to update wallet for.
            wallet_data: The Pydantic model containing the update data.

        Returns:
            The updated UserWallet instance, or None if not found.
        """
        logger.debug(f"Updating wallet for user: {user_id}")
        wallet = await self.get_user_wallet(user_id)
        if not wallet:
            return None

        update_data = wallet_data.model_dump(exclude_unset=True, exclude_none=True)
        for key, value in update_data.items():
            if hasattr(wallet, key):
                setattr(wallet, key, value)

        self.db.add(wallet)
        await self.db.flush()
        await self.db.refresh(wallet)

        logger.info(f"Updated wallet for user {user_id}")
        return wallet

    async def credit_wallet(self, user_id: str, amount: int) -> UserWallet:
        """
        Credits amount to user's wallet (increases balance).
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID to credit.
            amount: The amount to credit (must be positive).

        Returns:
            The updated UserWallet instance.
        """
        logger.debug(f"Crediting {amount} to user {user_id}")
        wallet = await self.get_or_create_user_wallet(user_id)

        wallet.virtual_balance += amount
        wallet.total_credited += amount

        self.db.add(wallet)
        await self.db.flush()
        await self.db.refresh(wallet)

        logger.info(f"Credited {amount} to user {user_id}, new balance: {wallet.virtual_balance}")
        return wallet

    async def deduct_wallet(self, user_id: str, amount: int) -> UserWallet:
        """
        Deducts amount from user's wallet (decreases balance).
        This function does NOT commit the transaction.
        Does NOT check if balance is sufficient - caller must verify.

        Args:
            user_id: The user ID to deduct from.
            amount: The amount to deduct (must be positive).

        Returns:
            The updated UserWallet instance.
        """
        logger.debug(f"Deducting {amount} from user {user_id}")
        wallet = await self.get_or_create_user_wallet(user_id)

        wallet.virtual_balance -= amount
        wallet.total_consumed += amount

        self.db.add(wallet)
        await self.db.flush()
        await self.db.refresh(wallet)

        logger.info(f"Deducted {amount} from user {user_id}, new balance: {wallet.virtual_balance}")
        return wallet
