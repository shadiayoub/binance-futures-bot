# Managing New Trading Pairs

This guide explains how to add, configure, and manage new trading pairs in the modular multi-pair trading bot architecture.

## 🏗️ Architecture Overview

The bot uses a **modular, plug-and-play architecture** that allows you to easily add new trading pairs and run them independently.

### Key Components

- **One Codebase**: Single codebase supports all pairs
- **Easy Pair Addition**: New pairs added via configuration only
- **Independent Instances**: Each pair runs in its own instance
- **API Key Isolation**: Each instance can use different API keys
- **Environment-Driven**: All configuration via environment variables

### File Structure

```
src/
├── config/
│   ├── pairs/
│   │   ├── ada.ts          # ADA pair configuration
│   │   ├── eth.ts          # ETH pair configuration
│   │   ├── btc.ts          # BTC pair configuration (future)
│   │   └── index.ts        # Pair registry
│   ├── PairConfig.ts       # Pair configuration interface
│   └── index.ts            # Main config loader
├── services/
│   ├── PairFactory.ts      # Creates pair-specific services
│   └── PairLoader.ts       # Loads pair data from files
├── multi-pair-index.ts     # Multi-pair entry point
└── scripts/
    └── manage-pairs.ts     # Pair management tool
```

## 🧠 Global Dynamic Levels Configuration

The bot uses a **hybrid level system** (comprehensive + dynamic levels) that works well for most scenarios. Dynamic levels are now controlled globally for easier management:

### Global Setting (Recommended)
```bash
# Enable dynamic levels for all pairs
USE_DYNAMIC_LEVELS=true
```

### Pair-Specific Override (Optional)
```bash
# Override global setting for specific pairs
ADA_USE_DYNAMIC_LEVELS=false  # Disable for ADA only
ETH_USE_DYNAMIC_LEVELS=true   # Enable for ETH only
```

### Precedence Logic
1. **Pair-specific setting** (if defined) takes precedence
2. **Global setting** is used as fallback
3. **Default behavior**: Dynamic levels enabled globally

## 💰 Global Balance Configuration

The bot uses **dynamic balance detection** as the primary method for position sizing, with a global fallback for reliability:

### Dynamic Balance Detection (Primary)
- **Real-time balance**: Bot fetches current account balance from Binance
- **Automatic updates**: Balance is cached for 30 seconds, then refreshed
- **Shared account**: All pairs use the same real-time account balance

### Global Fallback (Secondary)
```bash
# Global fallback balance (used if API fails)
BASE_BALANCE=1000
```

### How It Works
1. **Primary**: Bot uses real-time balance from Binance API
2. **Fallback**: If API fails, uses `BASE_BALANCE` from environment
3. **Logging**: Shows both real-time and fallback values for transparency

### Position Sizing Calculation
```typescript
// Real-time balance detection
const effectiveBalance = await this.getEffectiveBalance();
const notionalValue = size * effectiveBalance * leverage;
const positionSize = notionalValue / currentPrice;
```

### Benefits
- ✅ **Automatic adaptation** to account balance changes
- ✅ **No manual updates** needed when balance changes
- ✅ **Reliable fallback** if API connection fails
- ✅ **Simplified configuration** (one global fallback for all pairs)

## 🔧 How Pair Enabling Works

There are **two levels** of control for enabling pairs:

### 1. Environment-Level Activation 🌍
**Controls which pairs are loaded from the registry**

```bash
# In your .env file
ACTIVE_PAIRS=ADAUSDT,ETHUSDT
```

**How it works:**
- Only pairs listed in `ACTIVE_PAIRS` will be loaded from the registry
- This is the **primary control** for which pairs are considered
- Pairs not listed here are completely ignored

### 2. Configuration-Level Enabling ⚙️
**Controls whether a loaded pair is actually enabled**

```bash
# In your .env file
ADA_ENABLED=true
ETH_ENABLED=false
```

**How it works:**
- Each pair has an `enabled` property controlled by `{SYMBOL}_ENABLED`
- Even if a pair is in `ACTIVE_PAIRS`, it won't start if `enabled: false`
- Default is `true` (enabled) unless explicitly set to `false`

## 📋 Enabling Scenarios

### Scenario 1: Enable Both Pairs
```bash
ACTIVE_PAIRS=ADAUSDT,ETHUSDT
ADA_ENABLED=true
ETH_ENABLED=true
```
**Result:** Both ADA and ETH bots will start

### Scenario 2: Enable Only ADA
```bash
ACTIVE_PAIRS=ADAUSDT,ETHUSDT
ADA_ENABLED=true
ETH_ENABLED=false
```
**Result:** Only ADA bot will start, ETH will be loaded but disabled

### Scenario 3: Run Only ADA (Most Efficient)
```bash
ACTIVE_PAIRS=ADAUSDT
# ADA_ENABLED defaults to true
```
**Result:** Only ADA bot will start, ETH won't even be loaded

## 🚀 Adding a New Trading Pair

### Step 1: Create Pair Configuration File

Create a new file: `src/config/pairs/{SYMBOL}.ts`

Example for BTC: `src/config/pairs/btc.ts`

```typescript
/**
 * BTC/USDT Pair Configuration
 * Complete configuration for BTC trading pair
 */

import { PairConfig } from '../PairConfig';

export const btcConfig: PairConfig = {
  // Basic pair information
  symbol: 'BTCUSDT',
  name: 'Bitcoin',
  enabled: process.env.BTC_ENABLED !== 'false',
  
  // Trading configuration
  baseBalance: parseFloat(process.env.BTC_BASE_BALANCE || '1000'),
  
  // Position sizing
  positionSizing: {
    anchorPositionSize: parseFloat(process.env.BTC_ANCHOR_POSITION_SIZE || '0.20'),
    anchorHedgeSize: parseFloat(process.env.BTC_ANCHOR_HEDGE_SIZE || '0.30'),
    opportunityPositionSize: parseFloat(process.env.BTC_OPPORTUNITY_POSITION_SIZE || '0.20'),
    opportunityHedgeSize: parseFloat(process.env.BTC_OPPORTUNITY_HEDGE_SIZE || '0.30'),
    scalpPositionSize: parseFloat(process.env.BTC_SCALP_POSITION_SIZE || '0.10'),
    scalpHedgeSize: parseFloat(process.env.BTC_SCALP_HEDGE_SIZE || '0.10'),
  },
  
  // Leverage settings
  leverageSettings: {
    anchorLeverage: parseInt(process.env.BTC_ANCHOR_LEVERAGE || '10'),
    hedgeLeverage: parseInt(process.env.BTC_HEDGE_LEVERAGE || '25'),
    opportunityLeverage: parseInt(process.env.BTC_OPPORTUNITY_LEVERAGE || '10'),
    scalpLeverage: parseInt(process.env.BTC_SCALP_LEVERAGE || '15'),
    scalpHedgeLeverage: parseInt(process.env.BTC_SCALP_HEDGE_LEVERAGE || '25'),
  },
  
  // Technical analysis configuration
  technicalConfig: {
    rsiPeriod: parseInt(process.env.BTC_RSI_PERIOD || '14'),
    emaFast: parseInt(process.env.BTC_EMA_FAST || '9'),
    emaSlow: parseInt(process.env.BTC_EMA_SLOW || '18'),
    volumePeriod: parseInt(process.env.BTC_VOLUME_PERIOD || '20'),
    volumeMultiplier: parseFloat(process.env.BTC_VOLUME_MULTIPLIER || '1.2'),
  },
  
  // Support/Resistance levels (from your analysis)
  supportResistanceLevels: {
    resistance1: parseFloat(process.env.BTC_RESISTANCE_1 || '50000.00'),
    resistance2: parseFloat(process.env.BTC_RESISTANCE_2 || '52000.00'),
    resistance3: parseFloat(process.env.BTC_RESISTANCE_3 || '55000.00'),
    support1: parseFloat(process.env.BTC_SUPPORT_1 || '48000.00'),
    support2: parseFloat(process.env.BTC_SUPPORT_2 || '46000.00'),
    support3: parseFloat(process.env.BTC_SUPPORT_3 || '44000.00'),
    liquidationStop: 0,
  },
  
  // Take profit percentages
  takeProfitPercentages: {
    anchor: parseFloat(process.env.BTC_ANCHOR_TP_PERCENT || '2.0'),
    opportunity: parseFloat(process.env.BTC_OPPORTUNITY_TP_PERCENT || '1.5'),
    scalp: parseFloat(process.env.BTC_SCALP_TP_PERCENT || '0.5'),
  },
  
  // Comprehensive levels configuration
  comprehensiveLevels: {
    source: 'csv',
    filePath: 'docs/BTCUSD-cheat-sheet.csv', // You'll need to create this
  },
  
  // Dynamic levels configuration
  dynamicLevels: {
    enabled: process.env.BTC_USE_DYNAMIC_LEVELS === 'true',
    learningPeriod: parseInt(process.env.BTC_LEARNING_PERIOD || '180'), // days
    timeframeWeights: {
      '4H': parseFloat(process.env.BTC_4H_WEIGHT || '1.0'),
      '1H': parseFloat(process.env.BTC_1H_WEIGHT || '0.7'),
      '15M': parseFloat(process.env.BTC_15M_WEIGHT || '0.4'),
    },
  },
  
  // Pair-specific settings
  settings: {
    minOrderSize: 10,        // $10 minimum order
    pricePrecision: 2,       // 2 decimal places for BTC
    quantityPrecision: 3,    // 3 decimal places for BTC quantity
    tickSize: 0.01,          // $0.01 minimum price increment
  },
};

export default btcConfig;
```

### Step 2: Register the Pair

Add the new pair to `src/config/pairs/index.ts`:

```typescript
import { btcConfig } from './btc';

// Registry of all available pairs
export const PAIR_REGISTRY: Map<string, PairConfig> = new Map([
  ['ADAUSDT', adaConfig],
  ['ETHUSDT', ethConfig],
  ['BTCUSDT', btcConfig], // ← Add this line
]);
```

### Step 3: Create Comprehensive Levels CSV

Create `docs/BTCUSD-cheat-sheet.csv` with your BTC support/resistance levels:

```csv
"Support/Resistance Levels",Price,"Key Turning Points"
"52-Week High","75000.000",
"13-Week High","70000.000",
"1-Month High","65000.000",
"14 Day RSI at 80%","62000.000",
"Pivot Point 3rd Level Resistance","60000.000",
"Price 3 Standard Deviations Resistance","58000.000",
"Pivot Point 2nd Level Resistance","56000.000",
"Price 2 Standard Deviations Resistance","54000.000",
"Pivot Point 1st Resistance Point","52000.000",
"Price 1 Standard Deviation Resistance","50000.000",
"Last","48000.000",
"Pivot Point 1st Support Point","46000.000",
"Price 1 Standard Deviation Support","44000.000",
"Price 2 Standard Deviations Support","42000.000",
"Pivot Point 2nd Support Point","40000.000",
"Price 3 Standard Deviations Support","38000.000",
"Pivot Point 3rd Support Point","36000.000",
"1-Month Low","34000.000",
"13-Week Low","32000.000",
"52-Week Low","30000.000",
"14 Day RSI at 20%","28000.000",
```

### Step 4: Add Environment Variables

Add BTC configuration to your `.env` file:

```bash
# BTC Configuration
BTC_ENABLED=true

# BTC Position Sizing
BTC_ANCHOR_POSITION_SIZE=0.20
BTC_ANCHOR_HEDGE_SIZE=0.30
BTC_OPPORTUNITY_POSITION_SIZE=0.20
BTC_OPPORTUNITY_HEDGE_SIZE=0.30
BTC_SCALP_POSITION_SIZE=0.10
BTC_SCALP_HEDGE_SIZE=0.10

# BTC Leverage Settings
BTC_ANCHOR_LEVERAGE=10
BTC_HEDGE_LEVERAGE=25
BTC_OPPORTUNITY_LEVERAGE=10
BTC_SCALP_LEVERAGE=15
BTC_SCALP_HEDGE_LEVERAGE=25

# BTC Technical Analysis
BTC_RSI_PERIOD=14
BTC_EMA_FAST=9
BTC_EMA_SLOW=18
BTC_VOLUME_PERIOD=20
BTC_VOLUME_MULTIPLIER=1.2

# BTC Support/Resistance Levels
BTC_RESISTANCE_1=50000.00
BTC_RESISTANCE_2=52000.00
BTC_RESISTANCE_3=55000.00
BTC_SUPPORT_1=48000.00
BTC_SUPPORT_2=46000.00
BTC_SUPPORT_3=44000.00

# BTC Take Profit Percentages
BTC_ANCHOR_TP_PERCENT=2.0
BTC_OPPORTUNITY_TP_PERCENT=1.5
BTC_SCALP_TP_PERCENT=0.5

# BTC Dynamic Levels
BTC_USE_DYNAMIC_LEVELS=true
BTC_LEARNING_PERIOD=180
BTC_4H_WEIGHT=1.0
BTC_1H_WEIGHT=0.7
BTC_15M_WEIGHT=0.4
```

### Step 5: Enable the New Pair

Add BTC to your active pairs:

```bash
# Enable BTC
ACTIVE_PAIRS=ADAUSDT,ETHUSDT,BTCUSDT
```

## 🔧 Management Commands

### Pair Management Script

```bash
# List all available pairs
npm run manage-pairs list

# Show configuration for a specific pair
npm run manage-pairs config BTCUSDT

# Validate pair configuration
npm run manage-pairs validate BTCUSDT

# Load comprehensive levels for a pair
npm run manage-pairs load-levels BTCUSDT

# Show currently active pairs
npm run manage-pairs active

# Show enabled pairs
npm run manage-pairs enabled
```

### Running the Bot

```bash
# Run all active pairs
npm run multi-pair

# Run single pair (backward compatibility)
npm start
```

## 🎯 Configuration Examples

### Single Pair (ADA only)
```bash
ACTIVE_PAIRS=ADAUSDT
```

### Multiple Pairs
```bash
ACTIVE_PAIRS=ADAUSDT,ETHUSDT,BTCUSDT
```

### Different Configurations per Pair
```bash
# ADA with conservative settings
ADA_ANCHOR_LEVERAGE=5
ADA_BASE_BALANCE=500

# ETH with moderate settings
ETH_ANCHOR_LEVERAGE=10
ETH_BASE_BALANCE=1000

# BTC with aggressive settings
BTC_ANCHOR_LEVERAGE=15
BTC_BASE_BALANCE=2000
```

### Disable Specific Pairs
```bash
# Keep in ACTIVE_PAIRS but disable
ETH_ENABLED=false
BTC_ENABLED=false
```

## 🔍 Verification Steps

### 1. Check Pair Registration
```bash
npm run manage-pairs list
```

### 2. Validate Configuration
```bash
npm run manage-pairs validate BTCUSDT
```

### 3. Test Level Loading
```bash
npm run manage-pairs load-levels BTCUSDT
```

### 4. Check Active Pairs
```bash
npm run manage-pairs active
```

### 5. Test Bot Startup
```bash
npm run multi-pair
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Pair Not Found
**Error:** `No configuration found for pair: BTCUSDT`
**Solution:** Ensure the pair is registered in `src/config/pairs/index.ts`

#### 2. CSV File Not Found
**Error:** `CSV file not found: docs/BTCUSD-cheat-sheet.csv`
**Solution:** Create the CSV file with proper support/resistance levels

#### 3. Configuration Validation Failed
**Error:** `Position sizes must add up to 100%`
**Solution:** Check that all position sizing percentages add up to 1.0 (100%)

#### 4. Pair Not Starting
**Error:** Pair is loaded but not starting
**Solution:** Check that the pair is both in `ACTIVE_PAIRS` and has `{SYMBOL}_ENABLED=true`

### Debug Commands

```bash
# Check pair configuration
npm run manage-pairs config BTCUSDT

# Validate all aspects
npm run manage-pairs validate BTCUSDT

# Check active pairs
npm run manage-pairs active

# Test level loading
npm run manage-pairs load-levels BTCUSDT
```

## 🎉 Benefits

### 1. One Codebase, Multiple Pairs
- ✅ Single codebase supports all pairs
- ✅ No code duplication
- ✅ Easy maintenance

### 2. Independent Deployment
- ✅ Each pair runs independently
- ✅ Different API keys per pair (future)
- ✅ Independent scaling

### 3. Easy Pair Addition
- ✅ Add new pairs via configuration only
- ✅ No code changes required
- ✅ Automatic validation

### 4. Flexible Configuration
- ✅ Environment-driven configuration
- ✅ Pair-specific settings
- ✅ Easy testing and deployment

## 📚 Next Steps

1. **Add your first new pair** following the steps above
2. **Test with paper trading** before going live
3. **Monitor performance** using the management tools
4. **Scale horizontally** by running different pairs on different instances
5. **Customize strategies** per pair based on market characteristics

The modular architecture is now ready for easy pair management and scaling! 🚀
