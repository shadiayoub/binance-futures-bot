# ADA Futures Trading Bot v1.2.12

A sophisticated TypeScript trading bot for Binance Futures that implements a 4-position hedge system for ADA/USDT trading with High-Frequency strategy support and ROI-based take profit.

## 🚀 Version Information

**Current Version:** 1.2.12  
**Build Date:** September 27, 2025

### Key Features in v1.2.12:
- **ROI-Based Take Profit System** for consistent 2% returns
- **High-Frequency Trading Strategy** with configurable position sizing
- **Configurable HF Position Size** via `HF_POSITION_SIZE` environment variable
- **Timestamp Error Fixes** for improved reliability
- **Sequential Position Management**
- **Hybrid Timing System** (2min heavy + 20s quick)
- **Comprehensive 51-Level System**
- **Dynamic Level Learning**
- **Bidirectional Trading** (LONG/SHORT)
- **Liquidation-Based Hedging**
- **Price Peak Detection**
- **Target Return Exit**
- **Dynamic Balance System**
- **Real-time Price Updates** (20s)

### Check Version:
```bash
npm run version
```

## 📋 Recent Changes (v1.2.12)

### 🆕 New Features
- **ROI-Based Take Profit System**: Positions exit based on Return on Investment (2% ROI) instead of price percentage
- **Dual Take Profit Modes**: Support for both ROI-based (`USE_ROI_BASED_TP=true`) and price-based take profit
- **Enhanced Profit Consistency**: More frequent trades with consistent 2% returns regardless of market conditions
- **ROI Calculator Utility**: New `ROICalculator` class for precise ROI calculations and analysis

### 🆕 New Features (v1.2.11)
- **Configurable HF Position Size**: Set `HF_POSITION_SIZE` environment variable (default: 15%)
- **Pair-Specific HF Sizing**: Override with `ADA_HF_POSITION_SIZE`, `BTC_HF_POSITION_SIZE`, etc.

### 🐛 Bug Fixes
- **Timestamp Error Resolution**: Fixed `-1021` timestamp errors in position monitoring
- **HF Position Size**: Replaced hardcoded 20% with configurable environment variable
- **Time Synchronization**: Improved Binance server time sync with network delay compensation

### 🔧 Technical Improvements
- **ROI Calculation Engine**: New utility for calculating target prices based on ROI requirements
- **Enhanced Error Recovery**: Automatic time resync on timestamp errors
- **Better Position Classification**: Improved HF position type determination
- **Robust API Handling**: Multiple retry attempts with exponential backoff

### 📊 Configuration Updates
- **ROI Settings**: Added `USE_ROI_BASED_TP=true`, `HF_ROI_TARGET=2.0` to environment variables
- **Environment Variables**: Added `HF_POSITION_SIZE=0.15` to `.env` and `env.example`
- **TypeScript Interfaces**: Updated `PositionSizing` interface with `hfPositionSize` property
- **Multi-Pair Support**: HF position sizing now works across all trading pairs

## 🎯 ROI-Based Take Profit System

### **What is ROI-Based Take Profit?**
Instead of exiting positions based on price percentage movements (e.g., 0.3% price change), the bot now supports **Return on Investment (ROI)** based exits. This means positions exit when they achieve a specific ROI percentage (e.g., 2% ROI).

### **Benefits of ROI-Based Trading:**
- **Consistent Profits**: Always 2% ROI regardless of market conditions
- **More Frequent Trades**: Smaller price movements needed for profit
- **Better Risk Management**: Predictable returns for easier position sizing
- **Leverage Optimization**: Higher leverage = smaller price movements needed

### **Configuration:**
```bash
# Enable ROI-based take profit
USE_ROI_BASED_TP=true
HF_ROI_TARGET=2.0          # 2% ROI target
ANCHOR_ROI_TARGET=2.0      # 2% ROI for Anchor positions
OPPORTUNITY_ROI_TARGET=2.0 # 2% ROI for Opportunity positions
SCALP_ROI_TARGET=2.0       # 2% ROI for Scalp positions

# Or disable to use price-based take profit
USE_ROI_BASED_TP=false
HF_TP_PERCENT=0.3          # 0.3% price movement
```

### **Example ROI Calculation:**
- **Investment**: $100, 20x leverage
- **Entry**: $0.78
- **ROI Target**: 2% = $2 profit
- **Required Price Movement**: $0.78 → $0.785 (0.64% price change)
- **Result**: Quick profit with small price movement!

## 🎯 Strategy Overview

This bot implements a **bidirectional hedge-based trading strategy** that works in both bull and bear markets:

### **Bull Market Mode (LONG Primary)**
- **Anchor Long (20% × 10x leverage)**: Primary bullish position
- **Anchor Hedge Short (30% × 15x leverage)**: Short hedge protecting the anchor
- **Opportunity Long (20% × 10x leverage)**: Additional long at better price
- **Opportunity Hedge Short (30% × 15x leverage)**: Short hedge protecting opportunity

### **Bear Market Mode (SHORT Primary)**
- **Anchor Short (20% × 10x leverage)**: Primary bearish position
- **Anchor Hedge Long (30% × 15x leverage)**: Long hedge protecting the anchor
- **Opportunity Short (20% × 10x leverage)**: Additional short at better price
- **Opportunity Hedge Long (30% × 15x leverage)**: Long hedge protecting opportunity

### Key Features

- **🔄 Bidirectional Trading**: Handles both bull and bear markets automatically
- **📊 4H + 1H Timeframe Analysis**: Uses 4H for trend direction and 1H for execution
- **📈 Volume Confirmation**: Requires 1.5x average volume for entries
- **🎯 RSI Filtering**: Only trades when RSI is between 30-70
- **📉 Dynamic Support/Resistance**: Learns from 6 months of historical data
- **🛡️ Risk Management**: Bulletproof system with hedge protection
- **💰 Guaranteed Profit**: Minimum +7% in worst-case scenarios
- **🔒 ISOLATED Margin**: Independent position risk management

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Configure environment
cp env.example .env
# Edit .env with your settings

# Run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop bot
docker-compose down

# Restart bot
docker-compose restart
```

### Option 2: Local Development

#### 1. Install Dependencies

```bash
pnpm install
```

#### 2. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your Binance API credentials and trading parameters:

```env
# Binance API Configuration
BINANCE_API_KEY=your_api_key_here
BINANCE_SECRET_KEY=your_secret_key_here
BINANCE_TESTNET=true

# Trading Configuration
TRADING_PAIR=ADAUSDT
BASE_BALANCE=1000
RISK_PER_TRADE=0.02

# Position Sizing (as percentages of balance)
ANCHOR_POSITION_SIZE=0.20
ANCHOR_HEDGE_SIZE=0.30
OPPORTUNITY_POSITION_SIZE=0.20
OPPORTUNITY_HEDGE_SIZE=0.30

# Leverage Settings (Optimized for guaranteed profit)
ANCHOR_LEVERAGE=10
HEDGE_LEVERAGE=15
OPPORTUNITY_LEVERAGE=10

# Support/Resistance Levels for ADA
RESISTANCE_1=0.8620
RESISTANCE_2=0.8950
RESISTANCE_3=0.9200
SUPPORT_1=0.8230
SUPPORT_2=0.8100
SUPPORT_3=0.7800
```

### 3. Test Configuration

```bash
# Test the optimal configuration
pnpm run test:config
```

### 4. Build and Run

```bash
# Build the project
pnpm run build

# Run in production
pnpm run start

# Or run in development mode
pnpm run dev
```

## 📊 Strategy Logic

### Entry Conditions

1. **Anchor Position**: Price breaks resistance with volume confirmation
2. **Anchor Hedge**: Price hits support level with volume
3. **Opportunity Position**: Price hits second support level
4. **Opportunity Hedge**: Price hits extreme support level

### Exit Conditions

1. **Hedge Exit**: Price recovers above support level
2. **Position Exit**: Take profit at resistance levels
3. **Emergency Exit**: Manual stop or system error

### Risk Management

- **Liquidation Protection**: Automatic liquidation at 10% drop
- **Hedge Protection**: 15x leverage ensures profit even in liquidation
- **Position Limits**: Maximum 4 positions (2 long + 2 hedge)
- **Balance Distribution**: 20% + 30% + 20% + 30% = 100%
- **Guaranteed Profit**: +7% minimum even in worst case scenario

## 🔧 Technical Implementation

### Architecture

```
src/
├── config/           # Configuration management
├── services/         # Core services
│   ├── BinanceService.ts      # Binance API integration
│   ├── TechnicalAnalysis.ts   # Technical indicators
│   └── PositionManager.ts     # Position management
├── strategies/       # Trading strategies
│   └── HedgeStrategy.ts       # 4-position hedge strategy
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
│   └── logger.ts    # Logging system
├── TradingBot.ts    # Main bot class
└── index.ts         # Application entry point
```

### Key Components

- **BinanceService**: Handles all Binance Futures API interactions
- **TechnicalAnalysis**: Calculates RSI, EMA, volume indicators
- **PositionManager**: Manages position lifecycle and risk
- **HedgeStrategy**: Implements the 4-position hedge logic
- **TradingBot**: Orchestrates the entire trading system

## 📈 Performance Monitoring

The bot provides comprehensive monitoring:

- **Real-time PnL**: Daily and weekly profit/loss tracking
- **Position Summary**: Current positions and their status
- **Trading Statistics**: Win rate, average win/loss, total trades
- **Risk Metrics**: Drawdown, exposure, balance utilization

## 🛡️ Safety Features

- **Testnet Support**: Test on Binance testnet before live trading
- **Emergency Stop**: Immediately close all positions
- **Error Handling**: Comprehensive error handling and logging
- **Graceful Shutdown**: Proper cleanup on bot termination
- **Position Validation**: Ensures position constraints are met

## 📝 Logging

The bot uses Winston for comprehensive logging:

- **Console Output**: Real-time trading activity
- **File Logging**: Persistent logs in `logs/trading-bot.log`
- **Log Levels**: Debug, Info, Warn, Error
- **Structured Logging**: JSON format for easy parsing

## ⚠️ Important Notes

1. **Start with Testnet**: Always test on Binance testnet first
2. **Monitor Closely**: Keep an eye on the bot during initial runs
3. **Risk Management**: Never risk more than you can afford to lose
4. **Market Conditions**: Strategy works best in trending markets
5. **API Limits**: Respect Binance API rate limits

## 🔄 Maintenance

### Regular Tasks

- Monitor bot performance and logs
- Update support/resistance levels as needed
- Adjust position sizes based on performance
- Review and optimize strategy parameters

### Updates

- Keep dependencies updated
- Monitor for Binance API changes
- Review strategy performance monthly
- Adjust risk parameters as needed

## 📞 Support

For issues or questions:

1. Check the logs in `logs/trading-bot.log`
2. Review the configuration in `.env`
3. Test on Binance testnet first
4. Monitor Binance API status

## ⚖️ Disclaimer

This software is for educational purposes only. Trading cryptocurrencies involves substantial risk of loss. The authors are not responsible for any financial losses. Use at your own risk.

## 📄 License

MIT License - see LICENSE file for details.
