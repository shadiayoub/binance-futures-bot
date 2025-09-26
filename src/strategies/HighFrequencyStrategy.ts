import { 
  Position, 
  TradingSignal, 
  MarketData, 
  TechnicalIndicators,
  SupportResistanceLevels,
  PositionSizing,
  LeverageSettings,
  AIAnalysisResult
} from '../types';
import { BinanceService } from '../services/BinanceService';
import { TechnicalAnalysis } from '../services/TechnicalAnalysis';
import { DynamicLevels } from '../services/DynamicLevels';
import { ComprehensiveLevels } from '../services/ComprehensiveLevels';
import { VolumeAnalysis, VolumeAnalysisResult } from '../services/VolumeAnalysis';
import { AIService } from '../services/AIService';
import { logger } from '../utils/logger';

export class HighFrequencyStrategy {
  private binanceService: BinanceService;
  private technicalAnalysis: TechnicalAnalysis;
  private supportResistanceLevels: SupportResistanceLevels;
  private dynamicLevels: DynamicLevels;
  private comprehensiveLevels: ComprehensiveLevels;
  private volumeAnalysis: VolumeAnalysis;
  private aiService: AIService;
  private positionSizing: PositionSizing;
  private leverageSettings: LeverageSettings;
  private currentPositions: Position[] = [];
  private useDynamicLevels: boolean = true;
  private priceHistory: Map<string, Array<{price: number, timestamp: number}>> = new Map();
  
  // High-frequency trading configuration
  private readonly PROFIT_TARGET = 0.006; // 0.6% profit target
  private readonly STOP_LOSS = 0.004; // 0.4% stop loss
  private readonly MIN_SIGNAL_STRENGTH = 0.6; // 60% minimum signal strength
  private readonly MAX_POSITIONS = 3; // Maximum concurrent positions
  private readonly ATR_STOP_MULTIPLIER = 1.0; // ATR multiplier for dynamic stops

  constructor(
    binanceService: BinanceService,
    technicalAnalysis: TechnicalAnalysis,
    supportResistanceLevels: SupportResistanceLevels,
    positionSizing: PositionSizing,
    leverageSettings: LeverageSettings,
    dynamicLevels?: DynamicLevels,
    aiService?: AIService
  ) {
    this.binanceService = binanceService;
    this.technicalAnalysis = technicalAnalysis;
    this.supportResistanceLevels = supportResistanceLevels;
    this.dynamicLevels = dynamicLevels || new DynamicLevels();
    this.comprehensiveLevels = new ComprehensiveLevels();
    this.volumeAnalysis = new VolumeAnalysis();
    this.aiService = aiService || new AIService({} as any);
    this.positionSizing = positionSizing;
    this.leverageSettings = leverageSettings;
  }

  /**
   * Main strategy execution method for high-frequency trading
   */
  async executeStrategy(marketData4h: MarketData[], marketData1h: MarketData[], marketData15m: MarketData[], aiAnalysis?: AIAnalysisResult | null): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    try {
      // Get technical indicators for all timeframes
      const indicators4h = this.technicalAnalysis.getTechnicalIndicators(marketData4h);
      const indicators1h = this.technicalAnalysis.getTechnicalIndicators(marketData1h);
      const indicators15m = this.technicalAnalysis.getTechnicalIndicators(marketData15m);
      
      const lastMarketData = marketData15m[marketData15m.length - 1];
      if (!lastMarketData) {
        logger.warn('No market data available for high-frequency strategy');
        return [];
      }
      const currentPrice = lastMarketData.price;

      // Learn levels from 15M data for precise entries
      this.dynamicLevels.learnLevels(marketData15m);

      // Check for high-frequency entry signals
      const entrySignal = await this.checkHighFrequencyEntry(currentPrice, indicators4h, indicators1h, indicators15m, aiAnalysis);
      if (entrySignal) {
        signals.push(entrySignal);
      }

      // Check for exit signals (profit targets and stops)
      const exitSignals = await this.checkHighFrequencyExits(currentPrice, indicators15m);
      signals.push(...exitSignals);

      return signals;
    } catch (error) {
      logger.error('High-frequency strategy execution failed', error);
      return [];
    }
  }

  /**
   * Check for high-frequency entry opportunities
   */
  private async checkHighFrequencyEntry(
    currentPrice: number, 
    indicators4h: TechnicalIndicators, 
    indicators1h: TechnicalIndicators, 
    indicators15m: TechnicalIndicators,
    aiAnalysis?: AIAnalysisResult | null
  ): Promise<TradingSignal | null> {
    
    // Check if we can open more positions
    if (this.currentPositions.length >= this.MAX_POSITIONS) {
      logger.debug('Maximum positions reached for high-frequency strategy');
      return null;
    }

    // Calculate signal strength
    const signalStrength = this.calculateSignalStrength(indicators4h, indicators1h, indicators15m, aiAnalysis);
    
    logger.info('🎯 High-Frequency Signal Analysis', {
      currentPrice: currentPrice.toFixed(4),
      signalStrength: (signalStrength.total * 100).toFixed(1) + '%',
      breakdown: signalStrength.breakdown
    });

    // Only proceed if signal strength is above minimum threshold
    if (signalStrength.total < this.MIN_SIGNAL_STRENGTH) {
      logger.debug('Signal strength below minimum threshold', {
        current: signalStrength.total,
        required: this.MIN_SIGNAL_STRENGTH
      });
      return null;
    }

    // Determine entry direction based on signal analysis
    const entryDirection = this.determineEntryDirection(signalStrength, indicators15m);
    if (!entryDirection) {
      logger.debug('No clear entry direction identified');
      return null;
    }

    // Calculate position size based on ATR
    const positionSize = this.calculatePositionSize(currentPrice, indicators15m.atr, signalStrength.total);
    
    // Create entry signal
    const signal: TradingSignal = {
      type: 'ENTRY',
      position: entryDirection,
      price: currentPrice,
      confidence: signalStrength.total,
      reason: this.generateEntryReason(signalStrength, entryDirection),
      timestamp: new Date()
    };

    logger.info('🚀 High-Frequency Entry Signal Generated', {
      direction: entryDirection,
      price: currentPrice.toFixed(4),
      confidence: (signalStrength.total * 100).toFixed(1) + '%',
      positionSize: (positionSize * 100).toFixed(1) + '%',
      profitTarget: (currentPrice * (1 + (entryDirection === 'LONG' ? this.PROFIT_TARGET : -this.PROFIT_TARGET))).toFixed(4),
      stopLoss: (currentPrice * (1 + (entryDirection === 'LONG' ? -this.STOP_LOSS : this.STOP_LOSS))).toFixed(4)
    });

    return signal;
  }

  /**
   * Calculate signal strength based on multiple indicators
   */
  private calculateSignalStrength(
    indicators4h: TechnicalIndicators,
    indicators1h: TechnicalIndicators,
    indicators15m: TechnicalIndicators,
    aiAnalysis?: AIAnalysisResult | null
  ): { total: number; breakdown: any } {
    
    let totalStrength = 0;
    const breakdown: any = {};

    // 1. Stochastic RSI (30% weight) - Ultra-sensitive momentum
    const stochStrength = this.calculateStochasticRSIStrength(indicators15m.stochasticRSI);
    totalStrength += stochStrength * 0.3;
    breakdown.stochasticRSI = (stochStrength * 100).toFixed(1) + '%';

    // 2. Bollinger Bands (25% weight) - Volatility-based entries
    const bbStrength = this.calculateBollingerBandsStrength(indicators15m.bollingerBands);
    totalStrength += bbStrength * 0.25;
    breakdown.bollingerBands = (bbStrength * 100).toFixed(1) + '%';

    // 3. Volume confirmation (20% weight) - Volume spike
    const volumeStrength = this.calculateVolumeStrength(indicators15m);
    totalStrength += volumeStrength * 0.2;
    breakdown.volume = (volumeStrength * 100).toFixed(1) + '%';

    // 4. ATR risk assessment (15% weight) - Low volatility preferred
    const atrStrength = this.calculateATRStrength(indicators15m.atr, indicators15m.bollingerBands.middle);
    totalStrength += atrStrength * 0.15;
    breakdown.atr = (atrStrength * 100).toFixed(1) + '%';

    // 5. MFI confirmation (10% weight) - Money flow
    const mfiStrength = this.calculateMFIStrength(indicators15m.mfi);
    totalStrength += mfiStrength * 0.1;
    breakdown.mfi = (mfiStrength * 100).toFixed(1) + '%';

    // AI Analysis bonus (if available)
    if (aiAnalysis && aiAnalysis.overallConfidence > 0.7) {
      const aiBonus = aiAnalysis.overallConfidence * 0.1;
      totalStrength += aiBonus;
      breakdown.aiBonus = (aiBonus * 100).toFixed(1) + '%';
    }

    return { total: Math.min(totalStrength, 1.0), breakdown };
  }

  /**
   * Calculate Stochastic RSI signal strength
   */
  private calculateStochasticRSIStrength(stochasticRSI: TechnicalIndicators['stochasticRSI']): number {
    const { k, d, isOversold, isOverbought } = stochasticRSI;
    
    // Strong signals for extreme conditions
    if (isOversold && k < 15) return 1.0; // Very oversold
    if (isOverbought && k > 85) return 1.0; // Very overbought
    
    // Moderate signals
    if (isOversold) return 0.8;
    if (isOverbought) return 0.8;
    
    // Weak signals for approaching extremes
    if (k < 25 || k > 75) return 0.5;
    
    // No signal in middle range
    return 0.0;
  }

  /**
   * Calculate Bollinger Bands signal strength
   */
  private calculateBollingerBandsStrength(bollingerBands: TechnicalIndicators['bollingerBands']): number {
    const { isUpperTouch, isLowerTouch, bandwidth } = bollingerBands;
    
    // Strong signals for band touches
    if (isLowerTouch) return 1.0; // Long signal
    if (isUpperTouch) return 1.0; // Short signal
    
    // Moderate signals for high volatility (good for 0.6% targets)
    if (bandwidth > 3.0) return 0.6;
    
    // Weak signals for moderate volatility
    if (bandwidth > 2.0) return 0.3;
    
    return 0.0;
  }

  /**
   * Calculate volume signal strength
   */
  private calculateVolumeStrength(indicators: TechnicalIndicators): number {
    const { volumeRatio, mfi } = indicators;
    
    // Strong volume confirmation
    if (volumeRatio > 2.0 && (mfi < 20 || mfi > 80)) return 1.0;
    
    // Moderate volume confirmation
    if (volumeRatio > 1.5) return 0.7;
    
    // Weak volume confirmation
    if (volumeRatio > 1.2) return 0.4;
    
    return 0.0;
  }

  /**
   * Calculate ATR risk strength (prefer lower volatility for 0.6% targets)
   */
  private calculateATRStrength(atr: number, currentPrice: number): number {
    const atrPercentage = (atr / currentPrice) * 100;
    
    // Perfect volatility for 0.6% targets
    if (atrPercentage < 1.0) return 1.0;
    
    // Good volatility
    if (atrPercentage < 1.5) return 0.8;
    
    // Acceptable volatility
    if (atrPercentage < 2.0) return 0.5;
    
    // Too volatile for 0.6% targets
    return 0.0;
  }

  /**
   * Calculate MFI signal strength
   */
  private calculateMFIStrength(mfi: number): number {
    // Strong signals for extremes
    if (mfi < 15 || mfi > 85) return 1.0;
    
    // Moderate signals
    if (mfi < 25 || mfi > 75) return 0.6;
    
    // Weak signals
    if (mfi < 35 || mfi > 65) return 0.3;
    
    return 0.0;
  }

  /**
   * Determine entry direction based on signal analysis
   */
  private determineEntryDirection(signalStrength: { total: number; breakdown: any }, indicators: TechnicalIndicators): 'LONG' | 'SHORT' | null {
    const { stochasticRSI, bollingerBands, mfi } = indicators;
    
    let longSignals = 0;
    let shortSignals = 0;
    
    // Stochastic RSI signals
    if (stochasticRSI.isOversold) longSignals++;
    if (stochasticRSI.isOverbought) shortSignals++;
    
    // Bollinger Bands signals
    if (bollingerBands.isLowerTouch) longSignals++;
    if (bollingerBands.isUpperTouch) shortSignals++;
    
    // MFI signals
    if (mfi < 20) longSignals++;
    if (mfi > 80) shortSignals++;
    
    // Determine direction
    if (longSignals > shortSignals && longSignals >= 2) return 'LONG';
    if (shortSignals > longSignals && shortSignals >= 2) return 'SHORT';
    
    return null;
  }

  /**
   * Calculate position size based on ATR and signal strength
   */
  private calculatePositionSize(currentPrice: number, atr: number, signalStrength: number): number {
    // Base position size from configuration
    const baseSize = this.positionSizing.scalpPositionSize;
    
    // Adjust based on signal strength
    const strengthMultiplier = 0.5 + (signalStrength * 0.5); // 0.5 to 1.0
    
    // Adjust based on ATR (lower ATR = larger position for 0.6% targets)
    const atrMultiplier = Math.max(0.5, Math.min(1.5, 1.0 / ((atr / currentPrice) * 100)));
    
    const finalSize = baseSize * strengthMultiplier * atrMultiplier;
    
    // Use configurable max position size instead of hardcoded value
    return Math.min(finalSize, this.positionSizing.maxPositionSize);
  }

  /**
   * Generate entry reason for logging
   */
  private generateEntryReason(signalStrength: { total: number; breakdown: any }, direction: 'LONG' | 'SHORT'): string {
    const reasons: string[] = [];
    
    Object.entries(signalStrength.breakdown).forEach(([indicator, strength]) => {
      if (parseFloat(strength as string) > 50) {
        reasons.push(`${indicator}: ${strength}`);
      }
    });
    
    return `HF ${direction} Entry - ${reasons.join(', ')}`;
  }

  /**
   * Check for high-frequency exit signals
   */
  private async checkHighFrequencyExits(currentPrice: number, indicators15m: TechnicalIndicators): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];
    
    for (const position of this.currentPositions) {
      if (position.status !== 'OPEN') continue;
      
      // Check profit target
      const profitTargetSignal = this.checkProfitTarget(position, currentPrice);
      if (profitTargetSignal) {
        signals.push(profitTargetSignal);
        continue;
      }
      
      // Check stop loss
      const stopLossSignal = this.checkStopLoss(position, currentPrice, indicators15m.atr);
      if (stopLossSignal) {
        signals.push(stopLossSignal);
        continue;
      }
      
      // Check indicator-based exits
      const indicatorExitSignal = this.checkIndicatorExits(position, indicators15m);
      if (indicatorExitSignal) {
        signals.push(indicatorExitSignal);
      }
    }
    
    return signals;
  }

  /**
   * Check if profit target is reached
   */
  private checkProfitTarget(position: Position, currentPrice: number): TradingSignal | null {
    const entryPrice = position.entryPrice;
    const isLong = position.side === 'LONG';
    
    let profitTargetPrice: number;
    if (isLong) {
      profitTargetPrice = entryPrice * (1 + this.PROFIT_TARGET);
    } else {
      profitTargetPrice = entryPrice * (1 - this.PROFIT_TARGET);
    }
    
    const isTargetReached = isLong ? 
      currentPrice >= profitTargetPrice : 
      currentPrice <= profitTargetPrice;
    
    if (isTargetReached) {
      logger.info('🎯 High-Frequency Profit Target Reached', {
        positionId: position.id,
        side: position.side,
        entryPrice: entryPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        profitTarget: profitTargetPrice.toFixed(4),
        profit: ((Math.abs(currentPrice - entryPrice) / entryPrice) * 100).toFixed(2) + '%'
      });
      
      return {
        type: 'EXIT',
        position: position.side,
        price: currentPrice,
        confidence: 1.0,
        reason: `HF Profit Target Reached (${this.PROFIT_TARGET * 100}%)`,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Check if stop loss is triggered
   */
  private checkStopLoss(position: Position, currentPrice: number, atr: number): TradingSignal | null {
    const entryPrice = position.entryPrice;
    const isLong = position.side === 'LONG';
    
    // Dynamic stop loss based on ATR
    const dynamicStopDistance = atr * this.ATR_STOP_MULTIPLIER;
    const staticStopDistance = entryPrice * this.STOP_LOSS;
    const stopDistance = Math.min(dynamicStopDistance, staticStopDistance);
    
    let stopLossPrice: number;
    if (isLong) {
      stopLossPrice = entryPrice - stopDistance;
    } else {
      stopLossPrice = entryPrice + stopDistance;
    }
    
    const isStopTriggered = isLong ? 
      currentPrice <= stopLossPrice : 
      currentPrice >= stopLossPrice;
    
    if (isStopTriggered) {
      logger.warn('🛑 High-Frequency Stop Loss Triggered', {
        positionId: position.id,
        side: position.side,
        entryPrice: entryPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        stopLoss: stopLossPrice.toFixed(4),
        loss: ((Math.abs(currentPrice - entryPrice) / entryPrice) * 100).toFixed(2) + '%'
      });
      
      return {
        type: 'EXIT',
        position: position.side,
        price: currentPrice,
        confidence: 1.0,
        reason: `HF Stop Loss Triggered (${this.STOP_LOSS * 100}%)`,
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Check for indicator-based exits
   */
  private checkIndicatorExits(position: Position, indicators: TechnicalIndicators): TradingSignal | null {
    const { stochasticRSI, bollingerBands, macd } = indicators;
    const isLong = position.side === 'LONG';
    
    // Stochastic RSI reversal
    if (isLong && stochasticRSI.isOverbought) {
      return {
        type: 'EXIT',
        position: position.side,
        price: indicators.bollingerBands.middle,
        confidence: 0.8,
        reason: 'HF Stochastic RSI Reversal',
        timestamp: new Date()
      };
    }
    
    if (!isLong && stochasticRSI.isOversold) {
      return {
        type: 'EXIT',
        position: position.side,
        price: indicators.bollingerBands.middle,
        confidence: 0.8,
        reason: 'HF Stochastic RSI Reversal',
        timestamp: new Date()
      };
    }
    
    // Bollinger Bands middle touch
    if (bollingerBands.isUpperTouch && isLong) {
      return {
        type: 'EXIT',
        position: position.side,
        price: indicators.bollingerBands.middle,
        confidence: 0.7,
        reason: 'HF Bollinger Middle Band Touch',
        timestamp: new Date()
      };
    }
    
    if (bollingerBands.isLowerTouch && !isLong) {
      return {
        type: 'EXIT',
        position: position.side,
        price: indicators.bollingerBands.middle,
        confidence: 0.7,
        reason: 'HF Bollinger Middle Band Touch',
        timestamp: new Date()
      };
    }
    
    return null;
  }

  /**
   * Update positions from external source
   */
  updatePositions(positions: Position[]): void {
    this.currentPositions = positions.filter(p => p.type === 'SCALP' || p.type === 'SCALP_HEDGE');
    logger.debug('High-frequency strategy positions updated', {
      count: this.currentPositions.length,
      positions: this.currentPositions.map(p => ({
        id: p.id,
        side: p.side,
        type: p.type,
        status: p.status
      }))
    });
  }

  /**
   * Get strategy statistics
   */
  getStrategyStats(): any {
    const openPositions = this.currentPositions.filter(p => p.status === 'OPEN');
    const closedPositions = this.currentPositions.filter(p => p.status === 'CLOSED');
    
    return {
      totalPositions: this.currentPositions.length,
      openPositions: openPositions.length,
      closedPositions: closedPositions.length,
      maxPositions: this.MAX_POSITIONS,
      profitTarget: this.PROFIT_TARGET * 100 + '%',
      stopLoss: this.STOP_LOSS * 100 + '%',
      minSignalStrength: this.MIN_SIGNAL_STRENGTH * 100 + '%'
    };
  }
}