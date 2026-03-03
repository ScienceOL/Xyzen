# Skill: Add a New Gift Campaign

Use this skill when the user asks to add a new gift campaign, gift mode, or reward type to the gift system.

## System Overview

The gift module lives under `service/app/core/gift/`. Campaigns run concurrently; each declares a `mode` string that maps to a pluggable handler via `MODE_REGISTRY`.

```
API  POST /gifts/{id}/claim
       │
       ▼
  GiftService.claim_gift()          ← service/app/core/gift/service.py
       │
       ├─ GiftRepository            ← service/app/repos/gift.py
       ├─ MODE_REGISTRY[mode]       ← service/app/core/gift/modes/__init__.py
       ├─ RedemptionRepository      ← credit wallet
       └─ SubscriptionRepository    ← model access unlock
```

Transaction rule: `GiftService` flushes but never commits. `api/v1/gift.py` commits/rollbacks.

## Steps to Add a New Campaign Mode

### 1. Create handler file

```
service/app/core/gift/modes/<mode_name>.py
```

Subclass `GiftModeHandler` from `modes/base.py`. Implement `compute_reward(day_number, consecutive_days, config) -> RewardResult`. The handler is a pure function — no DB access, no side effects. Use `config` dict for all tunable parameters.

Reference implementation: `modes/daily_credits_with_unlock.py`.

### 2. Register in MODE_REGISTRY

Edit `service/app/core/gift/modes/__init__.py`:

```python
from .<mode_name> import MyHandler
MODE_REGISTRY["<mode_name>"] = MyHandler()
```

### 3. Insert campaign row

Create a migration with `just migrate "add <name> gift campaign"`, then add a `bulk_insert` for `gift_campaigns` table in the `upgrade()` function. Required columns:

| Column | Example |
|--------|---------|
| `id` | `str(uuid4())` |
| `name` | `"spring_2025"` (unique) |
| `display_name_key` | `"gift.spring2025.title"` (i18n path) |
| `description_key` | `"gift.spring2025.description"` |
| `mode` | `"<mode_name>"` (must match MODE_REGISTRY key) |
| `config` | `json.dumps({...})` (mode-specific settings) |
| `total_days` | `14` |
| `starts_at` / `ends_at` | ISO 8601 with timezone |
| `is_active` | `True` |
| `created_at` / `updated_at` | `now()` or ISO string |

### 4. Add i18n keys

Add to `web/src/i18n/locales/{en,zh,ja}/gift.json`:

```json
{
  "<campaignKey>": {
    "title": "...",
    "description": "..."
  }
}
```

If the mode introduces new milestones, add keys under `milestones.*`.

### 5. Run checks

```bash
just type-backend && just lint-backend   # backend
cd web && npx tsc --noEmit && yarn lint  # frontend
just migrate-up                          # apply migration
```

No frontend component changes needed — the GiftBoxModal reads `display_name_key`/`description_key` from the API and renders reward cards from `RewardResult` fields automatically.

## Steps to Add a New Reward Type

If the new mode awards something beyond credits and model access:

1. Add field to `RewardResult` in `modes/base.py` (with zero/false default).
2. Add it to `RewardResult.to_dict()`.
3. Add application logic in `GiftService.claim_gift()` after existing credit/subscription blocks.
4. Add field to `RewardData` in `web/src/service/giftService.ts`.
5. Add a reward card in `web/src/components/features/GiftBoxModal.tsx` (copy the milestone card pattern).
6. Add i18n keys if needed.

## RewardResult Fields

| Field | Type | Applied by |
|-------|------|------------|
| `credits` | `int` | `RedemptionRepository.credit_wallet_typed()` |
| `credit_type` | `str` | Balance bucket: `"free"` / `"paid"` / `"earned"` |
| `full_model_access_days` | `int` | `SubscriptionRepository.extend_full_model_access()` |
| `milestone_reached` | `bool` | Triggers unlock + frontend badge |
| `milestone_name` | `str` | i18n key suffix: `gift.milestones.<name>` |

## Key Constraints

- Unique index `(user_id, campaign_id, day_number)` prevents duplicate claims at DB level.
- Consecutive days use CST (UTC+8) midnight normalization, matching `core/checkin.py`.
- `is_active=false` or outside date range → hidden from API + claim rejected.
- Error codes: 14200–14204 in `common/code/error_code.py`.
