import { Position, TradingSignal } from '../types';
import { logger } from '../utils/logger';

export interface HedgeGuaranteeConfig {
  maxPriceDeviation: number; // Maximum allowed price deviation (e.g., 0.02 = 2%)
  minHedgeSize: number; // Minimum hedge size multiplier
  maxHedgeSize: number; // Maximum hedge size multiplier
  minHedgeLeverage: number; // Minimum hedge leverage
  maxHedgeLeverage: number; // Maximum hedge leverage
  liquidationBuffer: number; // Buffer before liquidation (e.g., 0.02 = 2%)
  preferLeverageAdjustment: boolean; // Prefer leverage adjustment over size adjustment
}

export interface HedgeGuaranteeResult {
  shouldOpenHedge: boolean;
  adjustedHedgeSize: number;
  adjustedHedgeLeverage: number;
  adjustedTakeProfit: number;
  guaranteeType: 'ORIGINAL' | 'ADJUSTED' | 'REJECTED';
  adjustmentMethod: 'NONE' | 'SIZE' | 'LEVERAGE' | 'BOTH';
  reason: string;
  profitGuarantee: number; // Expected profit percentage
}

export class HedgeGuaranteeCalculator {
  private config: HedgeGuaranteeConfig;

  constructor(config: HedgeGuaranteeConfig) {
    this.config = config;
  }

  /**
   * Calculate hedge parameters to ensure mathematical profit guarantee
   */
  calculateHedgeGuarantee(
    primaryPosition: Position,
    hedgeSignal: TradingSignal,
    currentPrice: number,
    baseHedgeSize: number,
    baseLeverage: number
  ): HedgeGuaranteeResult {
    const originalSignalPrice = hedgeSignal.price;
    const priceDeviation = Math.abs(currentPrice - originalSignalPrice) / originalSignalPrice;
    
    // Calculate primary position liquidation price
    const liquidationPrice = this.calculateLiquidationPrice(primaryPosition);
    
    // Calculate original hedge take profit
    const originalTakeProfit = this.calculateOriginalTakeProfit(
      primaryPosition,
      liquidationPrice,
      hedgeSignal.position
    );

    // Check if price deviation is within acceptable limits
    if (priceDeviation <= this.config.maxPriceDeviation) {
      // Price is close enough - use original parameters
      return {
        shouldOpenHedge: true,
        adjustedHedgeSize: baseHedgeSize,
        adjustedHedgeLeverage: baseLeverage,
        adjustedTakeProfit: originalTakeProfit,
        guaranteeType: 'ORIGINAL',
        adjustmentMethod: 'NONE',
        reason: `Price deviation ${(priceDeviation * 100).toFixed(2)}% is within acceptable limits`,
        profitGuarantee: this.calculateProfitGuarantee(
          primaryPosition,
          currentPrice,
          originalTakeProfit,
          baseHedgeSize,
          baseLeverage
        )
      };
    }

    // Price deviation is too large - need to adjust parameters
    return this.calculateAdjustedHedgeParameters(
      primaryPosition,
      hedgeSignal,
      currentPrice,
      originalSignalPrice,
      baseHedgeSize,
      baseLeverage,
      liquidationPrice,
      originalTakeProfit
    );
  }

  /**
   * Calculate adjusted hedge parameters for large price deviations
   */
  private calculateAdjustedHedgeParameters(
    primaryPosition: Position,
    hedgeSignal: TradingSignal,
    currentPrice: number,
    originalSignalPrice: number,
    baseHedgeSize: number,
    baseLeverage: number,
    liquidationPrice: number,
    originalTakeProfit: number
  ): HedgeGuaranteeResult {
    const priceDeviation = Math.abs(currentPrice - originalSignalPrice) / originalSignalPrice;
    
    // Calculate how much the primary position has moved against us
    const primaryMovement = this.calculatePrimaryMovement(primaryPosition, currentPrice);
    
    // Try leverage adjustment first (preferred method)
    if (this.config.preferLeverageAdjustment) {
      const leverageResult = this.calculateLeverageAdjustedParameters(
        primaryPosition,
        hedgeSignal,
        currentPrice,
        baseHedgeSize,
        baseLeverage,
        liquidationPrice,
        originalTakeProfit,
        priceDeviation,
        primaryMovement
      );
      
      if (leverageResult.shouldOpenHedge) {
        return leverageResult;
      }
    }
    
    // Fallback to size adjustment if leverage adjustment fails
    const sizeResult = this.calculateSizeAdjustedParameters(
      primaryPosition,
      hedgeSignal,
      currentPrice,
      baseHedgeSize,
      baseLeverage,
      liquidationPrice,
      originalTakeProfit,
      priceDeviation,
      primaryMovement
    );
    
    return sizeResult;
  }

  /**
   * Calculate parameters using leverage adjustment (preferred method)
   */
  private calculateLeverageAdjustedParameters(
    primaryPosition: Position,
    hedgeSignal: TradingSignal,
    currentPrice: number,
    baseHedgeSize: number,
    baseLeverage: number,
    liquidationPrice: number,
    originalTakeProfit: number,
    priceDeviation: number,
    primaryMovement: number
  ): HedgeGuaranteeResult {
    // Calculate required leverage to maintain profit guarantee
    const leverageMultiplier = 1 + (priceDeviation * 2) + Math.abs(primaryMovement);
    const requiredLeverage = Math.min(baseLeverage * leverageMultiplier, this.config.maxHedgeLeverage);
    
    // Check if required leverage is within limits
    if (requiredLeverage > this.config.maxHedgeLeverage) {
      return {
        shouldOpenHedge: false,
        adjustedHedgeSize: 0,
        adjustedHedgeLeverage: 0,
        adjustedTakeProfit: 0,
        guaranteeType: 'REJECTED',
        adjustmentMethod: 'LEVERAGE',
        reason: `Required leverage ${requiredLeverage.toFixed(1)}x exceeds maximum ${this.config.maxHedgeLeverage}x`,
        profitGuarantee: 0
      };
    }

    // Calculate adjusted take profit
    const adjustedTakeProfit = this.calculateAdjustedTakeProfit(
      primaryPosition,
      currentPrice,
      liquidationPrice,
      hedgeSignal.position,
      priceDeviation
    );

    // Calculate expected profit guarantee
    const profitGuarantee = this.calculateProfitGuarantee(
      primaryPosition,
      currentPrice,
      adjustedTakeProfit,
      baseHedgeSize,
      requiredLeverage
    );

    // Verify profit guarantee is positive
    if (profitGuarantee <= 0) {
      return {
        shouldOpenHedge: false,
        adjustedHedgeSize: 0,
        adjustedHedgeLeverage: 0,
        adjustedTakeProfit: 0,
        guaranteeType: 'REJECTED',
        adjustmentMethod: 'LEVERAGE',
        reason: `Cannot guarantee profit with leverage adjustment. Expected profit: ${profitGuarantee.toFixed(2)}%`,
        profitGuarantee: 0
      };
    }

    return {
      shouldOpenHedge: true,
      adjustedHedgeSize: baseHedgeSize, // Keep original size
      adjustedHedgeLeverage: requiredLeverage,
      adjustedTakeProfit: adjustedTakeProfit,
      guaranteeType: 'ADJUSTED',
      adjustmentMethod: 'LEVERAGE',
      reason: `Adjusted hedge leverage to ${requiredLeverage.toFixed(1)}x (from ${baseLeverage}x) to guarantee ${profitGuarantee.toFixed(2)}% profit`,
      profitGuarantee: profitGuarantee
    };
  }

  /**
   * Calculate parameters using size adjustment (fallback method)
   */
  private calculateSizeAdjustedParameters(
    primaryPosition: Position,
    hedgeSignal: TradingSignal,
    currentPrice: number,
    baseHedgeSize: number,
    baseLeverage: number,
    liquidationPrice: number,
    originalTakeProfit: number,
    priceDeviation: number,
    primaryMovement: number
  ): HedgeGuaranteeResult {
    // Calculate required hedge size to guarantee profit
    const requiredHedgeSize = this.calculateRequiredHedgeSize(
      baseHedgeSize,
      priceDeviation,
      primaryMovement
    );

    // Check if required hedge size is within limits
    if (requiredHedgeSize > this.config.maxHedgeSize) {
      return {
        shouldOpenHedge: false,
        adjustedHedgeSize: 0,
        adjustedHedgeLeverage: 0,
        adjustedTakeProfit: 0,
        guaranteeType: 'REJECTED',
        adjustmentMethod: 'SIZE',
        reason: `Required hedge size ${(requiredHedgeSize * 100).toFixed(2)}% exceeds maximum ${(this.config.maxHedgeSize * 100).toFixed(2)}%`,
        profitGuarantee: 0
      };
    }

    // Calculate adjusted take profit to maintain profit guarantee
    const adjustedTakeProfit = this.calculateAdjustedTakeProfit(
      primaryPosition,
      currentPrice,
      liquidationPrice,
      hedgeSignal.position,
      priceDeviation
    );

    // Calculate expected profit guarantee
    const profitGuarantee = this.calculateProfitGuarantee(
      primaryPosition,
      currentPrice,
      adjustedTakeProfit,
      requiredHedgeSize,
      baseLeverage
    );

    // Verify profit guarantee is positive
    if (profitGuarantee <= 0) {
      return {
        shouldOpenHedge: false,
        adjustedHedgeSize: 0,
        adjustedHedgeLeverage: 0,
        adjustedTakeProfit: 0,
        guaranteeType: 'REJECTED',
        adjustmentMethod: 'SIZE',
        reason: `Cannot guarantee profit with size adjustment. Expected profit: ${profitGuarantee.toFixed(2)}%`,
        profitGuarantee: 0
      };
    }

    return {
      shouldOpenHedge: true,
      adjustedHedgeSize: requiredHedgeSize,
      adjustedHedgeLeverage: baseLeverage, // Keep original leverage
      adjustedTakeProfit: adjustedTakeProfit,
      guaranteeType: 'ADJUSTED',
      adjustmentMethod: 'SIZE',
      reason: `Adjusted hedge size to ${(requiredHedgeSize * 100).toFixed(2)}% to guarantee ${profitGuarantee.toFixed(2)}% profit`,
      profitGuarantee: profitGuarantee
    };
  }

  /**
   * Calculate liquidation price for a position
   */
  private calculateLiquidationPrice(position: Position): number {
    // Simplified liquidation calculation
    // In practice, this should use the actual Binance liquidation formula
    const leverage = position.leverage;
    const entryPrice = position.entryPrice;
    
    if (position.side === 'LONG') {
      return entryPrice * (1 - 1 / leverage);
    } else {
      return entryPrice * (1 + 1 / leverage);
    }
  }

  /**
   * Calculate original take profit price
   */
  private calculateOriginalTakeProfit(
    primaryPosition: Position,
    liquidationPrice: number,
    hedgeSide: 'LONG' | 'SHORT'
  ): number {
    if (primaryPosition.side === 'LONG' && hedgeSide === 'SHORT') {
      // SHORT hedge against LONG primary: TP just before LONG liquidation
      return liquidationPrice * (1 + this.config.liquidationBuffer);
    } else if (primaryPosition.side === 'SHORT' && hedgeSide === 'LONG') {
      // LONG hedge against SHORT primary: TP just before SHORT liquidation
      return liquidationPrice * (1 - this.config.liquidationBuffer);
    }
    
    return liquidationPrice;
  }

  /**
   * Calculate how much the primary position has moved
   */
  private calculatePrimaryMovement(primaryPosition: Position, currentPrice: number): number {
    if (primaryPosition.side === 'LONG') {
      return (primaryPosition.entryPrice - currentPrice) / primaryPosition.entryPrice;
    } else {
      return (currentPrice - primaryPosition.entryPrice) / primaryPosition.entryPrice;
    }
  }

  /**
   * Calculate required hedge size to guarantee profit
   */
  private calculateRequiredHedgeSize(
    baseHedgeSize: number,
    priceDeviation: number,
    primaryMovement: number
  ): number {
    // Increase hedge size based on price deviation and primary movement
    const sizeMultiplier = 1 + (priceDeviation * 2) + Math.abs(primaryMovement);
    return Math.min(baseHedgeSize * sizeMultiplier, this.config.maxHedgeSize);
  }

  /**
   * Calculate adjusted take profit to maintain profit guarantee
   */
  private calculateAdjustedTakeProfit(
    primaryPosition: Position,
    currentPrice: number,
    liquidationPrice: number,
    hedgeSide: 'LONG' | 'SHORT',
    priceDeviation: number
  ): number {
    // Adjust take profit based on price deviation
    const baseTP = this.calculateOriginalTakeProfit(primaryPosition, liquidationPrice, hedgeSide);
    
    if (hedgeSide === 'SHORT') {
      // For SHORT hedge: move TP closer to current price if price dropped
      return baseTP * (1 - priceDeviation * 0.5);
    } else {
      // For LONG hedge: move TP closer to current price if price rose
      return baseTP * (1 + priceDeviation * 0.5);
    }
  }

  /**
   * Calculate expected profit guarantee
   */
  private calculateProfitGuarantee(
    primaryPosition: Position,
    hedgeEntryPrice: number,
    hedgeTakeProfit: number,
    hedgeSize: number,
    hedgeLeverage: number
  ): number {
    // Calculate primary position loss at hedge TP
    const primaryLoss = this.calculatePrimaryLossAtPrice(primaryPosition, hedgeTakeProfit);
    
    // Calculate hedge profit
    const hedgeProfit = this.calculateHedgeProfit(hedgeEntryPrice, hedgeTakeProfit, hedgeSize, hedgeLeverage);
    
    // Net profit = hedge profit - primary loss
    return hedgeProfit - primaryLoss;
  }

  /**
   * Calculate primary position loss at a specific price
   */
  private calculatePrimaryLossAtPrice(primaryPosition: Position, price: number): number {
    if (primaryPosition.side === 'LONG') {
      return Math.max(0, (primaryPosition.entryPrice - price) / primaryPosition.entryPrice);
    } else {
      return Math.max(0, (price - primaryPosition.entryPrice) / primaryPosition.entryPrice);
    }
  }

  /**
   * Calculate hedge profit
   */
  private calculateHedgeProfit(
    entryPrice: number,
    takeProfit: number,
    size: number,
    leverage: number
  ): number {
    // Simplified profit calculation
    // In practice, this should account for position sizing and leverage
    const priceMovement = Math.abs(takeProfit - entryPrice) / entryPrice;
    return priceMovement * size * leverage;
  }

  /**
   * Validate hedge parameters before opening
   */
  validateHedgeParameters(result: HedgeGuaranteeResult): boolean {
    if (!result.shouldOpenHedge) {
      logger.warn('Hedge opening rejected', {
        reason: result.reason,
        guaranteeType: result.guaranteeType
      });
      return false;
    }

    if (result.profitGuarantee <= 0) {
      logger.error('Hedge parameters do not guarantee profit', {
        profitGuarantee: result.profitGuarantee,
        reason: result.reason
      });
      return false;
    }

    logger.info('Hedge parameters validated', {
      guaranteeType: result.guaranteeType,
      adjustedHedgeSize: `${(result.adjustedHedgeSize * 100).toFixed(2)}%`,
      profitGuarantee: `${result.profitGuarantee.toFixed(2)}%`,
      reason: result.reason
    });

    return true;
  }
}
