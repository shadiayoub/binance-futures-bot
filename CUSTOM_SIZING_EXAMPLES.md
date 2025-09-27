# Custom Position Sizing Examples

## Overview

The bot now supports configurable position sizing via `.env` variables that bypasses automatic multi-pair scaling.

## How It Works

- **Default Behavior**: Auto-scales position sizes based on number of active pairs
- **Custom Override**: Setting any `BASE_*_SIZE` variable disables auto-scaling and uses your exact values

## Examples

### Example 1: Force 20% Anchor Sizing (No Scaling)

```bash
# In your .env file
BASE_ANCHOR_SIZE=0.20
ACTIVE_PAIRS=ADAUSDT,ETHUSDT,BNBUSDT

# Result: Always uses 20% anchor sizing regardless of 3 pairs
# Instead of auto-scaled 10.7% (0.20 × 0.533)
```

### Example 2: Larger Position Sizes

```bash
# In your .env file
BASE_ANCHOR_SIZE=0.30
BASE_HEDGE_SIZE=0.40
ACTIVE_PAIRS=ADAUSDT,ETHUSDT,BNBUSDT

# Result: Uses 30% anchor + 40% hedge (70% per pair)
# Total exposure: 210% (high risk, but your choice)
```

### Example 3: Conservative Sizing

```bash
# In your .env file
BASE_ANCHOR_SIZE=0.10
BASE_HEDGE_SIZE=0.15
ACTIVE_PAIRS=ADAUSDT,ETHUSDT,BNBUSDT

# Result: Uses 10% anchor + 15% hedge (25% per pair)
# Total exposure: 75% (conservative)
```

### Example 4: Single Pair with Custom Sizing

```bash
# In your .env file
BASE_ANCHOR_SIZE=0.25
ACTIVE_PAIRS=ADAUSDT

# Result: Uses 25% anchor sizing for single pair
# (Would normally be 20% by default)
```

## Available Variables

- `BASE_ANCHOR_SIZE` - Anchor position size (default: 0.20)
- `BASE_HEDGE_SIZE` - Hedge position size (default: 0.30)
- `BASE_OPPORTUNITY_SIZE` - Opportunity position size (default: 0.20)
- `BASE_SCALP_SIZE` - Scalp position size (default: 0.10)
- `BASE_SCALP_HEDGE_SIZE` - Scalp hedge size (default: 0.10)

## Important Notes

⚠️ **Risk Warning**: Setting custom sizing disables safety scaling. Ensure your total exposure is manageable.

✅ **Flexibility**: You can set just one variable (e.g., only `BASE_ANCHOR_SIZE`) and others will use defaults.

🔧 **Logging**: The bot will log when custom sizing is detected and show which variables are set.

## Current Bot Configuration

To get full 20% anchor sizing with your current setup:

```bash
# Add to your .env file
BASE_ANCHOR_SIZE=0.20
```

This will give you:
- **Balance**: $7.00
- **Anchor Size**: 20% (instead of 10.7%)
- **Leverage**: 20x
- **Notional Value**: $7.00 × 0.20 × 20 = $28.00
- **Position Size**: $28.00 ÷ $0.7815 = **35.8 ADA** (instead of 19 ADA)