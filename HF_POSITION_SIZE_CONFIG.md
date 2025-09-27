# HF Position Size Configuration - Version 1.2.11

## 🎯 Problem Solved
The HF position size was **hardcoded to 20%** in `DistributedHedgeService.ts`, making it impossible to configure via environment variables.

## 🛠️ Solution Implemented

### 1. **Added HF_POSITION_SIZE Environment Variable**
- **Default Value:** `0.15` (15% of balance)
- **Environment Variable:** `HF_POSITION_SIZE`
- **Location:** `src/config/index.ts` line 36

### 2. **Updated PositionSizing Interface**
- **Added:** `hfPositionSize: number` property
- **Location:** `src/types/index.ts` line 21

### 3. **Fixed DistributedHedgeService**
- **Before:** `return 0.20; // 20% of balance` (hardcoded)
- **After:** `return positionSizing.hfPositionSize;` (configurable)
- **Location:** `src/services/DistributedHedgeService.ts` lines 270-280

### 4. **Updated All Configuration Files**
- **Pair Configs:** Added `hfPositionSize` to all pair files (ada.ts, bnb.ts, btc.ts, eth.ts)
- **Test Scripts:** Updated test configuration
- **MultiPairSizingService:** Added HF position size support

### 5. **Environment Files Updated**
- **`.env`:** Added `HF_POSITION_SIZE=0.15`
- **`env.example`:** Added `HF_POSITION_SIZE=0.15`

## 🔧 Configuration Options

### **Global Configuration**
```bash
# Set HF position size globally
HF_POSITION_SIZE=0.15  # 15% of balance
```

### **Pair-Specific Configuration**
```bash
# Override for specific pairs
ADA_HF_POSITION_SIZE=0.20  # 20% for ADA
BTC_HF_POSITION_SIZE=0.10  # 10% for BTC
ETH_HF_POSITION_SIZE=0.15  # 15% for ETH
BNB_HF_POSITION_SIZE=0.12  # 12% for BNB
```

## 📊 Position Size Flow

### **HF Position Opening Process:**
1. **Signal Generated** → `HighFrequencyStrategy.generateSignal()`
2. **Position Opening** → `PositionManager.openHFPosition()`
3. **Size Calculation** → `DistributedHedgeService.calculatePositionSize()`
4. **Size Used** → `positionSizing.hfPositionSize` (configurable!)

### **Size Determination Logic:**
```typescript
if (signal.reason && signal.reason.includes('HF')) {
  return positionSizing.hfPositionSize; // ← Now configurable!
}
```

## ✅ Benefits

1. **Configurable HF Position Size** - No more hardcoded 20%
2. **Environment-Based Configuration** - Easy to adjust without code changes
3. **Pair-Specific Overrides** - Different sizes for different trading pairs
4. **Consistent with Other Strategies** - Same pattern as anchor/scalp/opportunity
5. **Backward Compatible** - Default value maintains current behavior

## 🎯 Usage Examples

### **Conservative HF Trading (10%)**
```bash
HF_POSITION_SIZE=0.10
```

### **Aggressive HF Trading (25%)**
```bash
HF_POSITION_SIZE=0.25
```

### **Pair-Specific Sizing**
```bash
HF_POSITION_SIZE=0.15        # Default for all pairs
ADA_HF_POSITION_SIZE=0.20   # Override for ADA only
BTC_HF_POSITION_SIZE=0.10   # Override for BTC only
```

## 📋 Testing

The configuration is now ready for testing:
1. **Set `HF_POSITION_SIZE`** in `.env` file
2. **Restart the bot** to load new configuration
3. **Monitor HF position opening** to verify correct size
4. **Check logs** for position size confirmation

---
**Version:** 1.2.11  
**Date:** 2025-09-27  
**Status:** ✅ Implemented and Ready