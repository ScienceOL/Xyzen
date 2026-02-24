import logging
from typing import Any, cast
from uuid import UUID

from sqlalchemy import case, func
from sqlalchemy import select as sa_select
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.redemption import (
    CreditLedger,
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
        New wallets receive a 200-credit welcome bonus.
        This function does NOT commit the transaction.

        Args:
            user_id: The user ID to get or create wallet for.

        Returns:
            The UserWallet instance.
        """
        logger.debug(f"Getting or creating wallet for user: {user_id}")
        wallet = await self.get_user_wallet(user_id)
        if wallet is None:
            welcome_bonus = 200
            wallet_data = UserWalletCreate(
                user_id=user_id,
                virtual_balance=welcome_bonus,
                free_balance=welcome_bonus,
                total_credited=welcome_bonus,
                total_consumed=0,
            )
            wallet = await self.create_user_wallet(wallet_data)

            # Write welcome bonus ledger entry
            ledger = CreditLedger(
                user_id=user_id,
                credit_type="free",
                direction="credit",
                amount=welcome_bonus,
                balance_after=welcome_bonus,
                total_balance_after=welcome_bonus,
                source="welcome_bonus",
            )
            self.db.add(ledger)
            await self.db.flush()

            logger.info(f"Created new wallet for user {user_id} with {welcome_bonus} welcome credits")
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

    async def credit_wallet_typed(
        self,
        user_id: str,
        amount: int,
        credit_type: str,
        source: str,
        reference_id: str | None = None,
    ) -> UserWallet:
        """Credits amount to a specific balance category and writes a ledger entry.

        Args:
            user_id: The user ID to credit.
            amount: The amount to credit (must be positive).
            credit_type: One of "free", "paid", "earned".
            source: Transaction source descriptor.
            reference_id: Optional reference ID for tracing.

        Returns:
            The updated UserWallet instance.
        """
        logger.debug(f"Crediting {amount} ({credit_type}) to user {user_id}, source={source}")
        wallet = await self.get_or_create_user_wallet(user_id)

        # Increment the specific balance field + virtual_balance + total_credited
        if credit_type == "free":
            wallet.free_balance += amount
        elif credit_type == "paid":
            wallet.paid_balance += amount
        elif credit_type == "earned":
            wallet.earned_balance += amount
        else:
            raise ValueError(f"Invalid credit_type: {credit_type}")

        wallet.virtual_balance += amount
        wallet.total_credited += amount

        self.db.add(wallet)
        await self.db.flush()
        await self.db.refresh(wallet)

        # Write ledger entry
        balance_after = getattr(wallet, f"{credit_type}_balance")
        ledger = CreditLedger(
            user_id=user_id,
            credit_type=credit_type,
            direction="credit",
            amount=amount,
            balance_after=balance_after,
            total_balance_after=wallet.virtual_balance,
            source=source,
            reference_id=reference_id,
        )
        self.db.add(ledger)
        await self.db.flush()

        logger.info(
            f"Credited {amount} ({credit_type}) to user {user_id}, "
            f"new balance: {wallet.virtual_balance} (free={wallet.free_balance}, "
            f"paid={wallet.paid_balance}, earned={wallet.earned_balance})"
        )
        return wallet

    async def deduct_wallet_ordered(
        self,
        user_id: str,
        amount: int,
        source: str,
        reference_id: str | None = None,
    ) -> tuple[UserWallet, int]:
        """Deducts amount using free → paid → earned order and writes ledger entries.

        Does NOT check if balance is sufficient — caller must verify.
        Deducts as much as possible from each category in order.

        Args:
            user_id: The user ID to deduct from.
            amount: The total amount to deduct (must be positive).
            source: Transaction source descriptor.
            reference_id: Optional reference ID for tracing.

        Returns:
            Tuple of (updated wallet, actual amount deducted).
        """
        logger.debug(f"Deducting {amount} (ordered) from user {user_id}, source={source}")
        wallet = await self.get_or_create_user_wallet(user_id)

        remaining = amount
        deductions: list[tuple[str, int]] = []

        # Deduct in order: free → paid → earned
        for credit_type in ("free", "paid", "earned"):
            if remaining <= 0:
                break
            balance = getattr(wallet, f"{credit_type}_balance")
            deduct_from_this = min(remaining, max(0, balance))
            if deduct_from_this > 0:
                setattr(wallet, f"{credit_type}_balance", balance - deduct_from_this)
                remaining -= deduct_from_this
                deductions.append((credit_type, deduct_from_this))

        actual_deducted = amount - remaining
        wallet.virtual_balance -= actual_deducted
        wallet.total_consumed += actual_deducted

        self.db.add(wallet)
        await self.db.flush()
        await self.db.refresh(wallet)

        # Write ledger entries for each category that was deducted
        for credit_type, deducted_amount in deductions:
            balance_after = getattr(wallet, f"{credit_type}_balance")
            ledger = CreditLedger(
                user_id=user_id,
                credit_type=credit_type,
                direction="debit",
                amount=deducted_amount,
                balance_after=balance_after,
                total_balance_after=wallet.virtual_balance,
                source=source,
                reference_id=reference_id,
            )
            self.db.add(ledger)
        await self.db.flush()

        logger.info(
            f"Deducted {actual_deducted} (ordered) from user {user_id}, "
            f"new balance: {wallet.virtual_balance} (free={wallet.free_balance}, "
            f"paid={wallet.paid_balance}, earned={wallet.earned_balance})"
        )
        return wallet, actual_deducted

    async def get_credit_ledger(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
        credit_type: str | None = None,
    ) -> list[CreditLedger]:
        """Query credit ledger history for a user.

        Args:
            user_id: The user ID.
            limit: Maximum number of entries to return.
            offset: Number of entries to skip.
            credit_type: Optional filter by credit type.

        Returns:
            List of CreditLedger entries ordered by created_at desc.
        """
        query = select(CreditLedger).where(CreditLedger.user_id == user_id)
        if credit_type is not None:
            query = query.where(CreditLedger.credit_type == credit_type)
        query = query.order_by(col(CreditLedger.created_at).desc()).limit(limit).offset(offset)

        result = await self.db.exec(query)
        return list(result.all())

    # ==================== Admin Aggregated Stats ====================

    async def get_admin_redemption_heatmap(
        self,
        year: int,
        tz: str = "UTC",
    ) -> list[dict[str, Any]]:
        """Daily aggregated redemption stats for an entire year."""
        from datetime import datetime
        from datetime import timezone as tz_module
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(tz)
        start_utc = datetime(year, 1, 1, tzinfo=zone).astimezone(tz_module.utc)
        end_utc = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone).astimezone(tz_module.utc)

        date_expr = func.to_char(func.timezone(tz, RedemptionHistory.redeemed_at), "YYYY-MM-DD")

        stmt = (
            sa_select(
                date_expr.label("date"),
                func.coalesce(func.sum(RedemptionHistory.amount), 0).label("total_credits"),
                func.count().label("redemption_count"),
                func.count(func.distinct(RedemptionHistory.user_id)).label("unique_users"),
            )
            .where(
                col(RedemptionHistory.redeemed_at) >= start_utc,
                col(RedemptionHistory.redeemed_at) <= end_utc,
            )
            .group_by(date_expr)
            .order_by(date_expr)
        )
        rows = (await self.db.exec(cast(Any, stmt))).all()

        return [
            {
                "date": str(r.date),
                "total_credits": int(r.total_credits),
                "redemption_count": int(r.redemption_count),
                "unique_users": int(r.unique_users),
            }
            for r in rows
        ]

    async def get_admin_redemption_rankings(
        self,
        year: int,
        tz: str = "UTC",
        date: str | None = None,
        limit: int = 20,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        """Per-user aggregated redemption stats."""
        from datetime import datetime
        from datetime import timezone as tz_module
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(tz)

        if date:
            day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=zone)
            start_utc = day.astimezone(tz_module.utc)
            end_utc = day.replace(hour=23, minute=59, second=59, microsecond=999999).astimezone(tz_module.utc)
        else:
            start_utc = datetime(year, 1, 1, tzinfo=zone).astimezone(tz_module.utc)
            end_utc = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone).astimezone(tz_module.utc)

        stmt = sa_select(
            col(RedemptionHistory.user_id),
            func.coalesce(func.sum(col(RedemptionHistory.amount)), 0).label("total_credits"),
            func.count().label("redemption_count"),
        ).where(
            col(RedemptionHistory.redeemed_at) >= start_utc,
            col(RedemptionHistory.redeemed_at) <= end_utc,
        )

        if search:
            stmt = stmt.where(col(RedemptionHistory.user_id).ilike(f"%{search}%"))

        stmt = (
            stmt.group_by(col(RedemptionHistory.user_id))
            .order_by(func.sum(col(RedemptionHistory.amount)).desc())
            .limit(limit)
        )

        rows = (await self.db.exec(cast(Any, stmt))).all()

        return [
            {
                "user_id": str(r.user_id),
                "total_credits": int(r.total_credits),
                "redemption_count": int(r.redemption_count),
            }
            for r in rows
        ]

    async def get_admin_credit_heatmap(
        self,
        year: int,
        tz: str = "UTC",
        source: str | None = None,
        tier: str | None = None,
    ) -> list[dict[str, Any]]:
        """Daily aggregated credit stats from CreditLedger (direction='credit')."""
        from datetime import datetime
        from datetime import timezone as tz_module
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(tz)
        start_utc = datetime(year, 1, 1, tzinfo=zone).astimezone(tz_module.utc)
        end_utc = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone).astimezone(tz_module.utc)

        date_expr = func.to_char(func.timezone(tz, CreditLedger.created_at), "YYYY-MM-DD")

        filters: list[Any] = [
            col(CreditLedger.created_at) >= start_utc,
            col(CreditLedger.created_at) <= end_utc,
            col(CreditLedger.direction) == "credit",
        ]
        if source:
            filters.append(col(CreditLedger.source) == source)

        if tier:
            from app.models.subscription import SubscriptionRole, UserSubscription

            stmt = (
                sa_select(
                    date_expr.label("date"),
                    func.coalesce(func.sum(CreditLedger.amount), 0).label("total_credits"),
                    func.count().label("transaction_count"),
                    func.count(func.distinct(CreditLedger.user_id)).label("unique_users"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "welcome_bonus", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("welcome_bonus_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "redemption_code", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("redemption_code_credits"),
                    func.coalesce(
                        func.sum(
                            case(
                                (col(CreditLedger.source) == "subscription_monthly", col(CreditLedger.amount)), else_=0
                            )
                        ),
                        0,
                    ).label("subscription_monthly_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "daily_checkin", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("daily_checkin_credits"),
                )
                .select_from(CreditLedger)
                .join(UserSubscription, col(CreditLedger.user_id) == col(UserSubscription.user_id), isouter=True)
                .join(SubscriptionRole, col(UserSubscription.role_id) == col(SubscriptionRole.id), isouter=True)
                .where(*filters)
                .where(col(SubscriptionRole.name) == tier)
                .group_by(date_expr)
                .order_by(date_expr)
            )
        else:
            stmt = (
                sa_select(
                    date_expr.label("date"),
                    func.coalesce(func.sum(CreditLedger.amount), 0).label("total_credits"),
                    func.count().label("transaction_count"),
                    func.count(func.distinct(CreditLedger.user_id)).label("unique_users"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "welcome_bonus", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("welcome_bonus_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "redemption_code", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("redemption_code_credits"),
                    func.coalesce(
                        func.sum(
                            case(
                                (col(CreditLedger.source) == "subscription_monthly", col(CreditLedger.amount)), else_=0
                            )
                        ),
                        0,
                    ).label("subscription_monthly_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "daily_checkin", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("daily_checkin_credits"),
                )
                .where(*filters)
                .group_by(date_expr)
                .order_by(date_expr)
            )

        rows = (await self.db.exec(cast(Any, stmt))).all()

        return [
            {
                "date": str(r.date),
                "total_credits": int(r.total_credits),
                "transaction_count": int(r.transaction_count),
                "unique_users": int(r.unique_users),
                "welcome_bonus_credits": int(r.welcome_bonus_credits),
                "redemption_code_credits": int(r.redemption_code_credits),
                "subscription_monthly_credits": int(r.subscription_monthly_credits),
                "daily_checkin_credits": int(r.daily_checkin_credits),
            }
            for r in rows
        ]

    async def get_admin_credit_rankings(
        self,
        year: int,
        tz: str = "UTC",
        source: str | None = None,
        tier: str | None = None,
        date: str | None = None,
        limit: int = 20,
        search: str | None = None,
    ) -> list[dict[str, Any]]:
        """Per-user aggregated credit stats from CreditLedger (direction='credit')."""
        from datetime import datetime
        from datetime import timezone as tz_module
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(tz)

        if date:
            day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=zone)
            start_utc = day.astimezone(tz_module.utc)
            end_utc = day.replace(hour=23, minute=59, second=59, microsecond=999999).astimezone(tz_module.utc)
        else:
            start_utc = datetime(year, 1, 1, tzinfo=zone).astimezone(tz_module.utc)
            end_utc = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone).astimezone(tz_module.utc)

        filters: list[Any] = [
            col(CreditLedger.created_at) >= start_utc,
            col(CreditLedger.created_at) <= end_utc,
            col(CreditLedger.direction) == "credit",
        ]
        if source:
            filters.append(col(CreditLedger.source) == source)
        if search:
            filters.append(col(CreditLedger.user_id).ilike(f"%{search}%"))

        if tier:
            from app.models.subscription import SubscriptionRole, UserSubscription

            stmt = (
                sa_select(
                    col(CreditLedger.user_id),
                    func.coalesce(func.sum(col(CreditLedger.amount)), 0).label("total_credits"),
                    func.count().label("transaction_count"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "welcome_bonus", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("welcome_bonus_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "redemption_code", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("redemption_code_credits"),
                    func.coalesce(
                        func.sum(
                            case(
                                (col(CreditLedger.source) == "subscription_monthly", col(CreditLedger.amount)), else_=0
                            )
                        ),
                        0,
                    ).label("subscription_monthly_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "daily_checkin", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("daily_checkin_credits"),
                )
                .select_from(CreditLedger)
                .join(UserSubscription, col(CreditLedger.user_id) == col(UserSubscription.user_id), isouter=True)
                .join(SubscriptionRole, col(UserSubscription.role_id) == col(SubscriptionRole.id), isouter=True)
                .where(*filters)
                .where(col(SubscriptionRole.name) == tier)
                .group_by(col(CreditLedger.user_id))
                .order_by(func.sum(col(CreditLedger.amount)).desc())
                .limit(limit)
            )
        else:
            stmt = (
                sa_select(
                    col(CreditLedger.user_id),
                    func.coalesce(func.sum(col(CreditLedger.amount)), 0).label("total_credits"),
                    func.count().label("transaction_count"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "welcome_bonus", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("welcome_bonus_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "redemption_code", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("redemption_code_credits"),
                    func.coalesce(
                        func.sum(
                            case(
                                (col(CreditLedger.source) == "subscription_monthly", col(CreditLedger.amount)), else_=0
                            )
                        ),
                        0,
                    ).label("subscription_monthly_credits"),
                    func.coalesce(
                        func.sum(
                            case((col(CreditLedger.source) == "daily_checkin", col(CreditLedger.amount)), else_=0)
                        ),
                        0,
                    ).label("daily_checkin_credits"),
                )
                .where(*filters)
                .group_by(col(CreditLedger.user_id))
                .order_by(func.sum(col(CreditLedger.amount)).desc())
                .limit(limit)
            )

        rows = (await self.db.exec(cast(Any, stmt))).all()

        return [
            {
                "user_id": str(r.user_id),
                "total_credits": int(r.total_credits),
                "transaction_count": int(r.transaction_count),
                "welcome_bonus_credits": int(r.welcome_bonus_credits),
                "redemption_code_credits": int(r.redemption_code_credits),
                "subscription_monthly_credits": int(r.subscription_monthly_credits),
                "daily_checkin_credits": int(r.daily_checkin_credits),
            }
            for r in rows
        ]

    async def get_admin_new_users_heatmap(
        self,
        year: int,
        tz: str = "UTC",
    ) -> list[dict[str, Any]]:
        """Daily new user registrations from UserWallet.created_at."""
        from datetime import datetime
        from datetime import timezone as tz_module
        from zoneinfo import ZoneInfo

        zone = ZoneInfo(tz)
        start_utc = datetime(year, 1, 1, tzinfo=zone).astimezone(tz_module.utc)
        end_utc = datetime(year, 12, 31, 23, 59, 59, 999999, tzinfo=zone).astimezone(tz_module.utc)

        date_expr = func.to_char(func.timezone(tz, UserWallet.created_at), "YYYY-MM-DD")

        stmt = (
            sa_select(
                date_expr.label("date"),
                func.count().label("new_users"),
            )
            .where(
                col(UserWallet.created_at) >= start_utc,
                col(UserWallet.created_at) <= end_utc,
            )
            .group_by(date_expr)
            .order_by(date_expr)
        )
        rows = (await self.db.exec(cast(Any, stmt))).all()

        return [
            {
                "date": str(r.date),
                "new_users": int(r.new_users),
            }
            for r in rows
        ]
