# ROI-Based Take Profit Implementation

## 🎯 Current vs Desired Behavior

### **Current Implementation (Price Percentage)**
- **HF Strategy**: `HF_TP_PERCENT=0.3` = 0.3% price movement
- **Example**: Entry at $0.78, exit at $0.7823 (0.3% price increase)
- **Problem**: Same profit regardless of position size or leverage

### **Desired Implementation (ROI-Based)**
- **Target**: 2% ROI (return on investment)
- **Example**: $100 investment → $102 profit (2% ROI)
- **Benefit**: Consistent profit percentage regardless of price movement

## 🧮 ROI Calculation Formula

### **ROI Formula**
```
ROI = (Current PnL / Initial Investment) × 100
```

### **Where:**
- **Initial Investment** = Position Size × Entry Price
- **Current PnL** = Position Size × (Current Price - Entry Price) × Leverage
- **ROI Target** = 2% (configurable)

## 🛠️ Implementation Plan

### **1. Add ROI-Based Configuration**
```bash
# Environment Variables
HF_ROI_TARGET=2.0          # 2% ROI target
USE_ROI_BASED_TP=true      # Enable ROI-based take profit
```

### **2. Modify HighFrequencyStrategy**
- Add ROI calculation method
- Replace price-based TP with ROI-based TP
- Update signal generation to show ROI targets

### **3. Update PositionManager**
- Modify `setStaticTakeProfit` for ROI-based calculations
- Update profit monitoring logic

### **4. Benefits of ROI-Based TP**
- **Consistent Profits**: Always 2% ROI regardless of market conditions
- **Risk Management**: Smaller position sizes = smaller absolute losses
- **Frequent Trades**: More opportunities for 2% gains
- **Leverage Optimization**: Higher leverage = smaller price movements needed

## 📊 Example Scenarios

### **Scenario 1: Small Position, High Leverage**
- **Position**: $100 investment, 20x leverage
- **Entry**: $0.78
- **ROI Target**: 2% = $2 profit
- **Required Price Movement**: $0.78 → $0.785 (0.64% price change)
- **Exit**: When ROI reaches 2%

### **Scenario 2: Large Position, Low Leverage**
- **Position**: $1000 investment, 5x leverage
- **Entry**: $0.78
- **ROI Target**: 2% = $20 profit
- **Required Price Movement**: $0.78 → $0.7851 (0.65% price change)
- **Exit**: When ROI reaches 2%

## 🎯 Implementation Benefits

### **More Frequent Trades**
- Smaller price movements required for profit
- More opportunities in volatile markets
- Reduced waiting time for targets

### **Better Risk Management**
- Consistent profit percentages
- Predictable returns
- Easier position sizing

### **Leverage Optimization**
- Higher leverage = smaller price movements needed
- More efficient use of capital
- Better risk/reward ratios

## 🔧 Technical Implementation

### **New Methods Needed**
1. `calculateROI(position, currentPrice)` - Calculate current ROI
2. `calculateROITargetPrice(position, roiTarget)` - Calculate target price for ROI
3. `shouldExitOnROI(position, currentPrice)` - Check if ROI target reached

### **Configuration Updates**
- Add ROI-based environment variables
- Update position sizing logic
- Modify profit monitoring

### **Backward Compatibility**
- Keep price-based TP as fallback
- Environment variable to switch between modes
- Gradual migration path

---
**Status**: Ready for Implementation  
**Priority**: High (Better Risk Management)  
**Complexity**: Medium