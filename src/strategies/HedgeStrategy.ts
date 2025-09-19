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

export class HedgeStrategy {
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
    this.aiService = aiService || new AIService({} as any); // Fallback if no AI service provided
    this.positionSizing = positionSizing;
    this.leverageSettings = leverageSettings;
  }

  /**
   * Main strategy execution method
   */
  async executeStrategy(marketData4h: MarketData[], marketData1h: MarketData[], aiAnalysis?: AIAnalysisResult | null): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    try {
      // Dynamic levels are now updated centrally in TradingBot with combined learning

      // Get technical indicators for both timeframes
      const indicators4h = this.technicalAnalysis.getTechnicalIndicators(marketData4h);
      const indicators1h = this.technicalAnalysis.getTechnicalIndicators(marketData1h);
      
      const lastMarketData = marketData1h[marketData1h.length - 1];
      if (!lastMarketData) {
        logger.warn('No market data available');
        return [];
      }
      const currentPrice = lastMarketData.price;

      // Analyze volume conditions for scalp activation
      const volumeAnalysis = this.shouldActivateScalpStrategy(
        'ADAUSDT', // TODO: Make this dynamic based on trading pair
        lastMarketData.volume,
        marketData1h
      );

      // Check for entry signals (with volume analysis for scalp activation and AI insights)
      const entrySignal = await this.checkEntrySignal(currentPrice, indicators4h, indicators1h, volumeAnalysis, aiAnalysis);
      if (entrySignal) {
        signals.push(entrySignal);
      }

      // Check for hedge signals
      const hedgeSignals = await this.checkHedgeSignals(currentPrice, indicators1h);
      signals.push(...hedgeSignals);

      // Check for exit signals (only hedge exits - no early profit taking)
      const exitSignals = await this.checkExitSignals(currentPrice, indicators1h);
      signals.push(...exitSignals);

      // Check for re-entry signals
      const reEntrySignals = await this.checkReEntrySignals(currentPrice, indicators4h, indicators1h);
      signals.push(...reEntrySignals);

      return signals;
    } catch (error) {
      logger.error('Error executing strategy', error);
      return [];
    }
  }

  /**
   * Check for initial entry signal (Anchor position)
   */
  private async checkEntrySignal(
    currentPrice: number, 
    indicators4h: TechnicalIndicators, 
    indicators1h: TechnicalIndicators,
    volumeAnalysis: VolumeAnalysisResult,
    aiAnalysis?: AIAnalysisResult | null
  ): Promise<TradingSignal | null> {
    
    // Check if we already have an anchor position
    const hasAnchorPosition = this.currentPositions.some(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
    if (hasAnchorPosition) {
      return null;
    }

    // Check for scalp signals first (if volume conditions are met)
    if (volumeAnalysis.shouldActivateScalp && volumeAnalysis.scalpParameters) {
      const scalpSignal = this.checkScalpSignal(currentPrice, indicators4h, indicators1h, volumeAnalysis);
      if (scalpSignal) {
        return scalpSignal;
      }
    }

    // Check for resistance breakout (LONG anchor) with enhanced validation
    if (this.isResistanceBreakout(currentPrice, indicators4h, indicators1h)) {
      // ENHANCED VALIDATION: Check all conditions before creating signal
      const volumeValid = indicators1h.volumeRatio > 1.0; // Require above average volume
      const rsiValid = indicators1h.rsi < 30; // Require oversold for LONG entries
      const vwapValid = (indicators1h.vwapDistance || 0) < 0; // Price should be below VWAP
      
      logger.info('🔍 Enhanced LONG Anchor Entry Validation', {
        currentPrice: currentPrice.toFixed(4),
        volumeValid,
        volumeRatio: indicators1h.volumeRatio?.toFixed(2) || 'N/A',
        rsiValid,
        rsi: indicators1h.rsi?.toFixed(1) || 'N/A',
        vwapValid,
        vwapDistance: (indicators1h.vwapDistance || 0).toFixed(2) + '%',
        resistanceBreakout: true
      });
      
      // Only create signal if all validation criteria are met
      if (volumeValid && rsiValid && vwapValid) {
        const signal = {
          type: 'ENTRY' as const,
          position: 'LONG' as const,
          price: currentPrice,
          confidence: this.calculateConfidence(indicators4h, indicators1h),
          reason: 'Resistance breakout with enhanced validation (volume + RSI + VWAP)',
          timestamp: new Date()
        };

        // Apply AI filtering
        if (this.shouldExecuteSignalWithAI(signal, aiAnalysis)) {
          logger.info('✅ LONG Anchor Entry Signal Approved', {
            price: currentPrice.toFixed(4),
            confidence: signal.confidence,
            reason: 'All validation criteria met'
          });
          return signal;
        } else {
          logger.info('🤖 AI filtered out LONG entry signal', { 
            originalConfidence: signal.confidence,
            aiReason: this.getAIFilterReason(signal, aiAnalysis)
          });
        }
      } else {
        logger.warn('❌ LONG Anchor Entry Blocked', {
          reason: 'Validation failed',
          volumeValid,
          rsiValid,
          vwapValid
        });
      }
    }

    // Check for support breakdown (SHORT anchor) with enhanced validation
    if (this.isSupportBreakdown(currentPrice, indicators4h, indicators1h)) {
      // ENHANCED VALIDATION: Check all conditions before creating signal
      const volumeValid = indicators1h.volumeRatio > 1.0; // Require above average volume
      const rsiValid = indicators1h.rsi > 70; // Require overbought for SHORT entries
      const vwapValid = (indicators1h.vwapDistance || 0) > 0; // Price should be above VWAP
      
      logger.info('🔍 Enhanced SHORT Anchor Entry Validation', {
        currentPrice: currentPrice.toFixed(4),
        volumeValid,
        volumeRatio: indicators1h.volumeRatio?.toFixed(2) || 'N/A',
        rsiValid,
        rsi: indicators1h.rsi?.toFixed(1) || 'N/A',
        vwapValid,
        vwapDistance: (indicators1h.vwapDistance || 0).toFixed(2) + '%',
        supportBreakdown: true
      });
      
      // Only create signal if all validation criteria are met
      if (volumeValid && rsiValid && vwapValid) {
        const signal = {
          type: 'ENTRY' as const,
          position: 'SHORT' as const,
          price: currentPrice,
          confidence: this.calculateConfidence(indicators4h, indicators1h),
          reason: 'Support breakdown with enhanced validation (volume + RSI + VWAP)',
          timestamp: new Date()
        };

        // Apply AI filtering
        if (this.shouldExecuteSignalWithAI(signal, aiAnalysis)) {
          logger.info('✅ SHORT Anchor Entry Signal Approved', {
            price: currentPrice.toFixed(4),
            confidence: signal.confidence,
            reason: 'All validation criteria met'
          });
          return signal;
        } else {
          logger.info('🤖 AI filtered out SHORT entry signal', { 
            originalConfidence: signal.confidence,
            aiReason: this.getAIFilterReason(signal, aiAnalysis)
          });
        }
      } else {
        logger.warn('❌ SHORT Anchor Entry Blocked', {
          reason: 'Validation failed',
          volumeValid,
          rsiValid,
          vwapValid
        });
      }
    }

    return null;
  }

  /**
   * Check for scalp signals based on volume conditions
   */
  private checkScalpSignal(
    currentPrice: number,
    indicators4h: TechnicalIndicators,
    indicators1h: TechnicalIndicators,
    volumeAnalysis: VolumeAnalysisResult
  ): TradingSignal | null {
    if (!volumeAnalysis.scalpParameters) {
      return null;
    }

    const scalpParams = volumeAnalysis.scalpParameters;

    // Check for scalp entry conditions (more sensitive than anchor)
    const isScalpLong = this.isScalpLongSignal(currentPrice, indicators4h, indicators1h);
    const isScalpShort = this.isScalpShortSignal(currentPrice, indicators4h, indicators1h);

    if (isScalpLong) {
      logger.info('🎯 High-Volume Scalp LONG Signal Generated', {
        currentPrice,
        volumeRatio: volumeAnalysis.volumeRatio.toFixed(2),
        scalpParameters: scalpParams,
        reason: `High volume scalp LONG - volume ${volumeAnalysis.volumeRatio.toFixed(2)}x average`
      });

      return {
        type: 'ENTRY',
        position: 'LONG',
        price: currentPrice,
        confidence: 0.85,
        reason: `High-volume scalp LONG (${volumeAnalysis.volumeRatio.toFixed(2)}x volume) - ${scalpParams.tpPercent}% target`,
        timestamp: new Date(),
        symbol: 'ADAUSDT' // TODO: Make dynamic
      };
    }

    if (isScalpShort) {
      logger.info('🎯 High-Volume Scalp SHORT Signal Generated', {
        currentPrice,
        volumeRatio: volumeAnalysis.volumeRatio.toFixed(2),
        scalpParameters: scalpParams,
        reason: `High volume scalp SHORT - volume ${volumeAnalysis.volumeRatio.toFixed(2)}x average`
      });

      return {
        type: 'ENTRY',
        position: 'SHORT',
        price: currentPrice,
        confidence: 0.85,
        reason: `High-volume scalp SHORT (${volumeAnalysis.volumeRatio.toFixed(2)}x volume) - ${scalpParams.tpPercent}% target`,
        timestamp: new Date(),
        symbol: 'ADAUSDT' // TODO: Make dynamic
      };
    }

    return null;
  }

  /**
   * Check for scalp LONG signal conditions
   */
  private isScalpLongSignal(
    currentPrice: number,
    indicators4h: TechnicalIndicators,
    indicators1h: TechnicalIndicators
  ): boolean {
    // More sensitive conditions for scalp
    const rsiOversold = indicators1h.rsi < 35; // More oversold than anchor
    const emaBullish = indicators1h.emaFast > indicators1h.emaSlow;
    const volumeSpike = indicators1h.volumeSma > 0; // Volume spike check (simplified)
    
    return rsiOversold && emaBullish && volumeSpike;
  }

  /**
   * Check for scalp SHORT signal conditions
   */
  private isScalpShortSignal(
    currentPrice: number,
    indicators4h: TechnicalIndicators,
    indicators1h: TechnicalIndicators
  ): boolean {
    // More sensitive conditions for scalp
    const rsiOverbought = indicators1h.rsi > 65; // More overbought than anchor
    const emaBearish = indicators1h.emaFast < indicators1h.emaSlow;
    const volumeSpike = indicators1h.volumeSma > 0; // Volume spike check (simplified)
    
    return rsiOverbought && emaBearish && volumeSpike;
  }

  /**
   * Check for hedge signals
   */
  private async checkHedgeSignals(
    currentPrice: number, 
    indicators1h: TechnicalIndicators
  ): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    // Check for anchor hedge signal
    const anchorPosition = this.currentPositions.find(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
    
    if (anchorPosition) {
      logger.info('🔍 Checking hedge conditions for ANCHOR position', {
        anchorSide: anchorPosition.side,
        anchorEntryPrice: anchorPosition.entryPrice,
        currentPrice: currentPrice,
        anchorPnL: ((currentPrice - anchorPosition.entryPrice) / anchorPosition.entryPrice * 100).toFixed(2) + '%'
      });
      
      const shouldHedge = this.shouldHedgeAnchor(currentPrice, indicators1h);
      logger.info('🔍 Hedge evaluation result', {
        shouldHedge: shouldHedge,
        currentPrice: currentPrice
      });
      
      if (shouldHedge) {
        // Determine hedge direction based on anchor side
        const hedgeDirection = anchorPosition.side === 'LONG' ? 'SHORT' : 'LONG';
        const hedgeReason = anchorPosition.side === 'LONG' 
          ? 'Price below first support, opening anchor hedge (SHORT)'
          : 'Price above first resistance, opening anchor hedge (LONG)';
        
        signals.push({
          type: 'HEDGE',
          position: hedgeDirection,
          price: currentPrice,
          confidence: 0.8,
          reason: hedgeReason,
          timestamp: new Date()
        });
      }
    }

    // Check for peak hedge signal
    const peakPosition = this.currentPositions.find(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
    if (peakPosition && this.shouldHedgeOpportunity(currentPrice, indicators1h)) {
      // Determine hedge direction based on peak side
      const hedgeDirection = peakPosition.side === 'LONG' ? 'SHORT' : 'LONG';
      const hedgeReason = peakPosition.side === 'LONG'
        ? 'LONG Peak reversal failed, opening hedge protection (SHORT)'
        : 'SHORT Peak reversal failed, opening hedge protection (LONG)';
      
      signals.push({
        type: 'HEDGE',
        position: hedgeDirection,
        price: currentPrice,
        confidence: 0.8,
        reason: hedgeReason,
        timestamp: new Date()
      });
    }

    return signals;
  }

  /**
   * Check for exit signals
   */
  private async checkExitSignals(
    currentPrice: number, 
    indicators1h: TechnicalIndicators
  ): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    // Check for hedge exit signals
    const hedgePositions = this.currentPositions.filter(pos => 
      (pos.type === 'ANCHOR_HEDGE' || pos.type === 'OPPORTUNITY_HEDGE') && pos.status === 'OPEN'
    );

    for (const hedgePosition of hedgePositions) {
      // Check if hedge should close due to profit exceeding anchor loss
      const anchorPosition = this.currentPositions.find(pos => 
        pos.type === 'ANCHOR' && pos.status === 'OPEN'
      );
      
      if (anchorPosition && this.shouldExitHedgeForProfit(anchorPosition, hedgePosition, currentPrice)) {
        // Exit both positions for net profit (liquidation-based or double profit)
        signals.push({
          type: 'EXIT',
          position: anchorPosition.side,
          price: currentPrice,
          confidence: 0.95,
          reason: 'Liquidation-based hedge strategy - closing both for guaranteed profit',
          timestamp: new Date()
        });
        signals.push({
          type: 'EXIT',
          position: hedgePosition.side,
          price: currentPrice,
          confidence: 0.95,
          reason: 'Liquidation-based hedge strategy - closing both for guaranteed profit',
          timestamp: new Date()
        });
      } else if (this.shouldCloseHedge(hedgePosition, currentPrice, indicators1h)) {
        // Regular hedge exit (price returned to entry)
        signals.push({
          type: 'EXIT',
          position: hedgePosition.side,
          price: currentPrice,
          confidence: 0.9,
          reason: 'Price returned to hedge entry price, closing hedge',
          timestamp: new Date()
        });
      }
    }

    // Check for primary position take profit exits (original targets)
    // This is the normal exit path when primary position reaches its target
    const anchorPositions = this.currentPositions.filter(pos => 
      pos.type === 'ANCHOR' && pos.status === 'OPEN'
    );

    for (const anchorPosition of anchorPositions) {
      if (this.shouldTakeProfitPrimary(anchorPosition, currentPrice, indicators1h)) {
        signals.push({
          type: 'EXIT',
          position: anchorPosition.side,
          price: currentPrice,
          confidence: 0.9,
          reason: 'Primary position reached take profit target - clean exit',
          timestamp: new Date()
        });
      }
    }

    // Check for peak position take profit exits (original targets)
    const peakPositions = this.currentPositions.filter(pos => 
      pos.type === 'OPPORTUNITY' && pos.status === 'OPEN'
    );

    for (const peakPosition of peakPositions) {
      if (this.shouldTakeProfitPrimary(peakPosition, currentPrice, indicators1h)) {
        signals.push({
          type: 'EXIT',
          position: peakPosition.side,
          price: currentPrice,
          confidence: 0.9,
          reason: 'Peak position reached take profit target - clean exit',
          timestamp: new Date()
        });
      }
    }

    return signals;
  }

  /**
   * Check for re-entry signals (Peak Strategy)
   */
  private async checkReEntrySignals(
    currentPrice: number, 
    indicators4h: TechnicalIndicators, 
    indicators1h: TechnicalIndicators
  ): Promise<TradingSignal[]> {
    const signals: TradingSignal[] = [];

    // Check if we should open Peak reversal position
    const hasPeakPosition = this.currentPositions.some(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
    if (!hasPeakPosition && this.shouldOpenPeakReversal(currentPrice, indicators4h, indicators1h)) {
      // Determine peak direction based on market detection (independent of existing positions)
      let peakDirection: 'LONG' | 'SHORT' | null = null;
      
      // Detect SHORT peak (market peaked and declining)
      if (this.detectMarketPeak(currentPrice, indicators1h)) {
        peakDirection = 'SHORT';
      }
      
      // Detect LONG peak (market bottomed and rising)
      if (this.detectMarketTrough(currentPrice, indicators1h)) {
        peakDirection = 'LONG';
      }
      
      if (peakDirection) {
        signals.push({
          type: 'RE_ENTRY',
          position: peakDirection,
          price: currentPrice,
          confidence: 0.8,
          reason: peakDirection === 'SHORT' 
            ? 'Peak detected - opening SHORT reversal position to catch decline'
            : 'Trough detected - opening LONG reversal position to catch rise',
          timestamp: new Date()
        });
      }
    }

    return signals;
  }

  /**
   * Check if price is breaking resistance with volume confirmation
   */
  private isResistanceBreakout(
    currentPrice: number, 
    indicators4h: TechnicalIndicators, 
    indicators1h: TechnicalIndicators
  ): boolean {
    // Use comprehensive levels system for resistance breakout detection
    const signals = this.comprehensiveLevels.getTradingSignals(currentPrice);
    const longEntry = signals.longEntry;
    
    // Check if we have a valid long entry signal
    if (!longEntry) {
      return false;
    }
    
    // Check if current price is near or at the resistance level (within 2.0% - more relaxed for hedged strategy)
    const priceTolerance = 0.02; // 2.0% tolerance - increased from 1.0% for more opportunities
    const isNearResistance = Math.abs(currentPrice - longEntry.price) / longEntry.price <= priceTolerance;
    const isAboveResistance = currentPrice >= longEntry.price;
    
    // Check volume confirmation (more relaxed for hedged strategy)
    const hasVolumeConfirmation = this.technicalAnalysis.isVolumeAboveThreshold(indicators1h.volumeRatio);
    
    // Check RSI is in valid range (expanded range for hedged strategy)
    const rsiValid = this.technicalAnalysis.isRSIInValidRange(indicators1h.rsi);
    
    // Check trend alignment (allow all trends for hedged strategy)
    const trendAligned = true; // Allow all trends since we're hedged - we profit either way

    // Debug logging for volume analysis
    logger.info('🔍 Volume Analysis for LONG Entry', {
      currentPrice: currentPrice.toFixed(4),
      resistanceLevel: longEntry.price.toFixed(4),
      volumeRatio: indicators1h.volumeRatio.toFixed(2),
      volumeThreshold: 0.1, // Current volume multiplier setting
      hasVolumeConfirmation,
      rsi: indicators1h.rsi.toFixed(1),
      rsiValid,
      isNearResistance,
      isAboveResistance
    });

    // Entry trigger: near resistance OR above resistance
    const shouldEnter = (isNearResistance || isAboveResistance) && hasVolumeConfirmation && rsiValid && trendAligned;

    if (shouldEnter) {
      logger.info('🔥 LONG Entry Signal Detected', {
        currentPrice: currentPrice.toFixed(4),
        resistanceLevel: longEntry.price.toFixed(4),
        description: longEntry.description,
        importance: longEntry.importance,
        zone: longEntry.zone,
        isNearResistance,
        isAboveResistance,
        hasVolumeConfirmation,
        rsiValid,
        trendAligned
      });
    }

    return shouldEnter;
  }

  /**
   * Check if price is breaking support with volume confirmation
   */
  private isSupportBreakdown(
    currentPrice: number, 
    indicators4h: TechnicalIndicators, 
    indicators1h: TechnicalIndicators
  ): boolean {
    // Use comprehensive levels system for support breakdown detection
    const signals = this.comprehensiveLevels.getTradingSignals(currentPrice);
    const shortEntry = signals.shortEntry;
    
    // Check if we have a valid short entry signal
    if (!shortEntry) {
      return false;
    }
    
    // Check if current price is near or at the support level (within 2.0% - more relaxed for hedged strategy)
    const priceTolerance = 0.02; // 2.0% tolerance - increased from 1.0% for more opportunities
    const isNearSupport = Math.abs(currentPrice - shortEntry.price) / shortEntry.price <= priceTolerance;
    const isBelowSupport = currentPrice <= shortEntry.price;
    
    // Check volume confirmation (more relaxed for hedged strategy)
    const hasVolumeConfirmation = this.technicalAnalysis.isVolumeAboveThreshold(indicators1h.volumeRatio);
    
    // Check RSI is in valid range (expanded range for hedged strategy)
    const rsiValid = this.technicalAnalysis.isRSIInValidRange(indicators1h.rsi);
    
    // Check trend alignment (allow all trends for hedged strategy)
    const trendAligned = true; // Allow all trends since we're hedged - we profit either way

    // Entry trigger: near support OR below support
    const shouldEnter = (isNearSupport || isBelowSupport) && hasVolumeConfirmation && rsiValid && trendAligned;

    if (shouldEnter) {
      logger.info('🔥 SHORT Entry Signal Detected', {
        currentPrice: currentPrice.toFixed(4),
        supportLevel: shortEntry.price.toFixed(4),
        description: shortEntry.description,
        importance: shortEntry.importance,
        zone: shortEntry.zone,
        isNearSupport,
        isBelowSupport,
        hasVolumeConfirmation,
        rsiValid,
        trendAligned
      });
    }

    return shouldEnter;
  }

  /**
   * Calculate liquidity zones with buffer zone between S/R levels
   * Returns protection zone (30% from entry, 70% from liquidation) with buffer zone
   */
  private calculateLiquidityZones(entryPrice: number, liquidationPrice: number, side: 'LONG' | 'SHORT', currentPrice: number): {
    protectionZoneStart: number;
    protectionZoneEnd: number;
    bufferZoneStart: number;
    bufferZoneEnd: number;
    isInProtectionZone: boolean;
    isInBufferZone: boolean;
    distanceFromEntry: number;
    distanceFromLiquidation: number;
  } {
    if (!liquidationPrice || liquidationPrice <= 0) {
      logger.warn('Invalid liquidation price for zone calculation', { entryPrice, liquidationPrice });
      return {
        protectionZoneStart: 0,
        protectionZoneEnd: 0,
        bufferZoneStart: 0,
        bufferZoneEnd: 0,
        isInProtectionZone: false,
        isInBufferZone: false,
        distanceFromEntry: 0,
        distanceFromLiquidation: 0
      };
    }

    const totalDistance = Math.abs(entryPrice - liquidationPrice);
    const protectionZoneSize = totalDistance * 0.30; // 30% of total distance
    const looseZoneSize = totalDistance * 0.70; // 70% of total distance
    const bufferZoneSize = totalDistance * 0.15; // 15% buffer zone between S/R and protection

    let protectionZoneStart: number;
    let protectionZoneEnd: number;
    let bufferZoneStart: number;
    let bufferZoneEnd: number;

    if (side === 'LONG') {
      // For LONG: protection zone is 30% from entry towards liquidation
      protectionZoneStart = entryPrice - protectionZoneSize;
      protectionZoneEnd = liquidationPrice + looseZoneSize;
      
      // Buffer zone is between current S/R and protection zone (loose area)
      bufferZoneStart = protectionZoneStart - bufferZoneSize;
      bufferZoneEnd = protectionZoneStart;
    } else {
      // For SHORT: protection zone is 30% from entry towards liquidation
      protectionZoneStart = liquidationPrice - looseZoneSize;
      protectionZoneEnd = entryPrice + protectionZoneSize;
      
      // Buffer zone is between current S/R and protection zone (loose area)
      bufferZoneStart = protectionZoneEnd;
      bufferZoneEnd = protectionZoneEnd + bufferZoneSize;
    }

    // Check if current price is in protection zone or buffer zone
    const isInProtectionZone = currentPrice >= protectionZoneStart && currentPrice <= protectionZoneEnd;
    const isInBufferZone = currentPrice >= bufferZoneStart && currentPrice <= bufferZoneEnd;

    // Calculate distances as percentages
    const distanceFromEntry = Math.abs(currentPrice - entryPrice) / entryPrice * 100;
    const distanceFromLiquidation = Math.abs(currentPrice - liquidationPrice) / liquidationPrice * 100;

    logger.info('🎯 Liquidity Zone Calculation with Buffer Zone', {
      side,
      entryPrice: entryPrice.toFixed(4),
      liquidationPrice: liquidationPrice.toFixed(4),
      currentPrice: currentPrice.toFixed(4),
      totalDistance: totalDistance.toFixed(4),
      protectionZoneStart: protectionZoneStart.toFixed(4),
      protectionZoneEnd: protectionZoneEnd.toFixed(4),
      bufferZoneStart: bufferZoneStart.toFixed(4),
      bufferZoneEnd: bufferZoneEnd.toFixed(4),
      protectionZoneSize: protectionZoneSize.toFixed(4),
      looseZoneSize: looseZoneSize.toFixed(4),
      bufferZoneSize: bufferZoneSize.toFixed(4),
      isInProtectionZone,
      isInBufferZone,
      distanceFromEntry: distanceFromEntry.toFixed(2) + '%',
      distanceFromLiquidation: distanceFromLiquidation.toFixed(2) + '%'
    });

    return {
      protectionZoneStart,
      protectionZoneEnd,
      bufferZoneStart,
      bufferZoneEnd,
      isInProtectionZone,
      isInBufferZone,
      distanceFromEntry,
      distanceFromLiquidation
    };
  }

  /**
   * Check if VWAP signals should be active in buffer zone
   */
  private shouldActivateVWAPSignals(currentPrice: number, entryPrice: number, liquidationPrice: number, side: 'LONG' | 'SHORT'): boolean {
    const liquidityZones = this.calculateLiquidityZones(entryPrice, liquidationPrice, side, currentPrice);
    
    // VWAP signals are active ONLY in buffer zone (no-trade zone)
    const vwapActive = liquidityZones.isInBufferZone;
    
    logger.info('📊 VWAP Signal Activation Check', {
      currentPrice: currentPrice.toFixed(4),
      entryPrice: entryPrice.toFixed(4),
      liquidationPrice: liquidationPrice.toFixed(4),
      side,
      isInBufferZone: liquidityZones.isInBufferZone,
      isInProtectionZone: liquidityZones.isInProtectionZone,
      vwapActive,
      vwapReason: vwapActive ? 
        'Price in buffer zone - VWAP signals active (no-trade zone)' : 
        'Price not in buffer zone - VWAP signals inactive'
    });
    
    return vwapActive;
  }

  /**
   * Check if scalp strategy should be activated based on volume conditions
   */
  private shouldActivateScalpStrategy(
    symbol: string,
    currentVolume: number,
    marketData: MarketData[]
  ): VolumeAnalysisResult {
    return this.volumeAnalysis.analyzeVolumeForScalp(symbol, currentVolume, marketData);
  }

  /**
   * Check VWAP signal confirmation for hedge entry
   * Single VWAP confirmation required before hedge execution
   */
  private checkVWAPSignalConfirmation(currentPrice: number, indicators1h: TechnicalIndicators, side: 'LONG' | 'SHORT'): boolean {
    const vwap = indicators1h.vwap;
    const vwapDistance = indicators1h.vwapDistance;
    
    if (!vwap || vwap === 0) {
      logger.warn('⚠️ VWAP not available for signal confirmation', {
        currentPrice: currentPrice.toFixed(4),
        vwap,
        side
      });
      return false;
    }

    // VWAP signal confirmation logic
    let vwapSignal = false;
    let signalReason = '';

    if (side === 'LONG') {
      // For LONG hedge: VWAP signal when price is below VWAP (oversold condition)
      vwapSignal = currentPrice < vwap && vwapDistance < -0.5; // Price 0.5% below VWAP
      signalReason = vwapSignal ? 
        `Price ${currentPrice.toFixed(4)} below VWAP ${vwap.toFixed(4)} (${vwapDistance.toFixed(2)}%) - oversold signal` :
        `Price ${currentPrice.toFixed(4)} not below VWAP ${vwap.toFixed(4)} (${vwapDistance.toFixed(2)}%) - no oversold signal`;
    } else {
      // For SHORT hedge: VWAP signal when price is above VWAP (overbought condition)
      vwapSignal = currentPrice > vwap && vwapDistance > 0.5; // Price 0.5% above VWAP
      signalReason = vwapSignal ? 
        `Price ${currentPrice.toFixed(4)} above VWAP ${vwap.toFixed(4)} (${vwapDistance.toFixed(2)}%) - overbought signal` :
        `Price ${currentPrice.toFixed(4)} not above VWAP ${vwap.toFixed(4)} (${vwapDistance.toFixed(2)}%) - no overbought signal`;
    }

    logger.info('📊 VWAP Signal Confirmation Check', {
      currentPrice: currentPrice.toFixed(4),
      vwap: vwap.toFixed(4),
      vwapDistance: vwapDistance.toFixed(2) + '%',
      side,
      vwapSignal,
      signalReason
    });

    return vwapSignal;
  }

  /**
   * Check if we should hedge the anchor position
   */
  private shouldHedgeAnchor(currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    const anchorPosition = this.currentPositions.find(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
    if (!anchorPosition) {
      logger.info('🔍 No ANCHOR position found for hedge check');
      return false;
    }

    // Check if we already have an anchor hedge
    const hasAnchorHedge = this.currentPositions.some(pos => pos.type === 'ANCHOR_HEDGE' && pos.status === 'OPEN');
    if (hasAnchorHedge) {
      logger.info('🔍 ANCHOR hedge already exists, skipping hedge check');
      return false;
    }

    // Calculate liquidity zones for zone-based hedging
    const liquidityZones = this.calculateLiquidityZones(
      anchorPosition.entryPrice, 
      anchorPosition.liquidationPrice || 0, 
      anchorPosition.side, 
      currentPrice
    );

    // Check hedge conditions based on anchor side
    if (anchorPosition.side === 'LONG') {
      // For LONG anchor: hedge when price drops below first support OR enters protection zone
      let isBelowFirstSupport = false;
      let nearestSupportPrice = 0;

      if (this.useDynamicLevels) {
        // Use dynamic support levels - get strongest support for hedging (more conservative)
        const supportLevels = this.dynamicLevels.getSupportLevels();
        const sortedSupports = supportLevels
          .filter(level => level.price < currentPrice)
          .sort((a, b) => b.strength - a.strength);
        
        // Use strongest support level for hedge trigger (more conservative approach)
        const strongestSupport = sortedSupports.length > 0 ? sortedSupports[0] : null;
        
        nearestSupportPrice = strongestSupport ? strongestSupport.price : 0;
        isBelowFirstSupport = strongestSupport ? currentPrice < strongestSupport.price : false;
        
        logger.info('🔍 Dynamic hedge check for LONG ANCHOR', {
          currentPrice: currentPrice,
          strongestSupportPrice: nearestSupportPrice,
          isBelowSupport: isBelowFirstSupport,
          useDynamicLevels: true,
          supportLevelsCount: supportLevels.length,
          sortedSupportsCount: sortedSupports.length,
          strongestSupportPriceFromArray: sortedSupports.length > 0 ? sortedSupports[0]?.price || 0 : 0,
          liquidityZones: {
            protectionZoneStart: liquidityZones.protectionZoneStart.toFixed(4),
            protectionZoneEnd: liquidityZones.protectionZoneEnd.toFixed(4),
            isInProtectionZone: liquidityZones.isInProtectionZone,
            distanceFromEntry: liquidityZones.distanceFromEntry.toFixed(2) + '%',
            distanceFromLiquidation: liquidityZones.distanceFromLiquidation.toFixed(2) + '%'
          }
        });
      } else {
        // Use static support levels - price below first support
        nearestSupportPrice = this.supportResistanceLevels.support1;
        isBelowFirstSupport = currentPrice < this.supportResistanceLevels.support1;
        
        logger.info('🔍 Static hedge check for LONG ANCHOR', {
          currentPrice: currentPrice,
          support1: this.supportResistanceLevels.support1,
          isBelowSupport: isBelowFirstSupport,
          useDynamicLevels: false
        });
      }

      // Zone-based hedging: hedge ONLY if price is in protection zone (NOT buffer zone)
      // Buffer zone is a "no-trade zone" to prevent frequent triggers
      const isInProtectionZone = liquidityZones.isInProtectionZone && !liquidityZones.isInBufferZone;
      
      // VWAP signal confirmation for hedge entry
      const vwapConfirmation = this.checkVWAPSignalConfirmation(currentPrice, indicators1h, 'LONG');
      
      const shouldHedge = isInProtectionZone && vwapConfirmation;
      
      logger.info('🎯 LONG Anchor Hedge Decision with VWAP Confirmation', {
        currentPrice: currentPrice.toFixed(4),
        isBelowFirstSupport,
        isInProtectionZone: liquidityZones.isInProtectionZone,
        isInBufferZone: liquidityZones.isInBufferZone,
        vwapConfirmation,
        shouldHedge,
        hedgeReason: shouldHedge ? 
          'Price in protection zone with VWAP confirmation' : 
          !isInProtectionZone ? 
            (liquidityZones.isInBufferZone ? 
              'Price in buffer zone (no-trade zone - VWAP signals only)' : 
              'Price not in protection zone') :
            'VWAP signal confirmation failed'
      });
      
      return shouldHedge;
    } else {
      // For SHORT anchor: hedge when price rises above first resistance
      let isAboveFirstResistance = false;

      if (this.useDynamicLevels) {
        // Use dynamic resistance levels - get strongest resistance for hedging (more conservative)
        const resistanceLevels = this.dynamicLevels.getResistanceLevels();
        const sortedResistances = resistanceLevels
          .filter(level => level.price > currentPrice)
          .sort((a, b) => b.strength - a.strength);
        
        // Use strongest resistance level for hedge trigger (more conservative approach)
        const strongestResistance = sortedResistances.length > 0 ? sortedResistances[0] : null;
        
        isAboveFirstResistance = strongestResistance ? currentPrice > strongestResistance.price : false;
        
        logger.info('🔍 Dynamic hedge check for SHORT ANCHOR', {
          currentPrice: currentPrice,
          strongestResistancePrice: strongestResistance ? strongestResistance.price : 0,
          isAboveResistance: isAboveFirstResistance,
          useDynamicLevels: true,
          resistanceLevelsCount: resistanceLevels.length,
          sortedResistancesCount: sortedResistances.length,
          strongestResistancePriceFromArray: sortedResistances.length > 0 ? sortedResistances[0]?.price || 0 : 0
        });
      } else {
        // Use static resistance levels - price above first resistance
        isAboveFirstResistance = currentPrice > this.supportResistanceLevels.resistance1;
        
        logger.info('🔍 Static hedge check for SHORT ANCHOR', {
          currentPrice: currentPrice,
          resistance1: this.supportResistanceLevels.resistance1,
          isAboveResistance: isAboveFirstResistance,
          useDynamicLevels: false
        });
      }

      // Zone-based hedging: hedge ONLY if price is in protection zone (NOT buffer zone)
      // Buffer zone is a "no-trade zone" to prevent frequent triggers
      const isInProtectionZone = liquidityZones.isInProtectionZone && !liquidityZones.isInBufferZone;
      
      // VWAP signal confirmation for hedge entry
      const vwapConfirmation = this.checkVWAPSignalConfirmation(currentPrice, indicators1h, 'SHORT');
      
      const shouldHedge = isInProtectionZone && vwapConfirmation;
      
      logger.info('🎯 SHORT Anchor Hedge Decision with VWAP Confirmation', {
        currentPrice: currentPrice.toFixed(4),
        isAboveFirstResistance,
        isInProtectionZone: liquidityZones.isInProtectionZone,
        isInBufferZone: liquidityZones.isInBufferZone,
        vwapConfirmation,
        shouldHedge,
        hedgeReason: shouldHedge ? 
          'Price in protection zone with VWAP confirmation' : 
          !isInProtectionZone ? 
            (liquidityZones.isInBufferZone ? 
              'Price in buffer zone (no-trade zone - VWAP signals only)' : 
              'Price not in protection zone') :
            'VWAP signal confirmation failed'
      });
      
      return shouldHedge;
    }
  }

  /**
   * Calculate hedge take profit price (just before anchor liquidation)
   */
  private calculateHedgeTakeProfitPrice(anchorPosition: Position, hedgePosition: Position): number {
    const anchorLiquidationPrice = this.calculateLiquidationPrice(anchorPosition);
    const liquidationBuffer = 0.02; // 2% buffer before liquidation
    
    if (anchorPosition.side === 'LONG' && hedgePosition.side === 'SHORT') {
      // For SHORT hedge against LONG anchor: TP just before LONG liquidation
      return anchorLiquidationPrice * (1 + liquidationBuffer);
    } else if (anchorPosition.side === 'SHORT' && hedgePosition.side === 'LONG') {
      // For LONG hedge against SHORT anchor: TP just before SHORT liquidation
      return anchorLiquidationPrice * (1 - liquidationBuffer);
    }
    
    return hedgePosition.entryPrice; // Fallback to entry price
  }

  /**
   * Check if we should hedge the Peak position
   */
  private shouldHedgeOpportunity(currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    const peakPosition = this.currentPositions.find(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
    if (!peakPosition) return false;

    // Check if we already have a peak hedge
    const hasPeakHedge = this.currentPositions.some(pos => pos.type === 'OPPORTUNITY_HEDGE' && pos.status === 'OPEN');
    if (hasPeakHedge) return false;

    // Check hedge conditions based on peak side
    if (peakPosition.side === 'LONG') {
      // For LONG Peak: hedge when price drops below entry (reversal failed)
      const priceBelowEntry = currentPrice < peakPosition.entryPrice;
      const priceDecline = (peakPosition.entryPrice - currentPrice) / peakPosition.entryPrice >= 0.01; // 1% decline
      
      if (priceBelowEntry && priceDecline) {
        logger.info('🛡️ LONG Peak Hedge Signal', {
          peakEntry: peakPosition.entryPrice.toFixed(4),
          currentPrice: currentPrice.toFixed(4),
          decline: `${((peakPosition.entryPrice - currentPrice) / peakPosition.entryPrice * 100).toFixed(2)}%`,
          reason: 'LONG Peak reversal failed - opening hedge protection'
        });
        return true;
      }
    } else {
      // For SHORT Peak: hedge when price rises above entry (reversal failed)
      const priceAboveEntry = currentPrice > peakPosition.entryPrice;
      const priceRise = (currentPrice - peakPosition.entryPrice) / peakPosition.entryPrice >= 0.01; // 1% rise
      
      if (priceAboveEntry && priceRise) {
        logger.info('🛡️ SHORT Peak Hedge Signal', {
          peakEntry: peakPosition.entryPrice.toFixed(4),
          currentPrice: currentPrice.toFixed(4),
          rise: `${((currentPrice - peakPosition.entryPrice) / peakPosition.entryPrice * 100).toFixed(2)}%`,
          reason: 'SHORT Peak reversal failed - opening hedge protection'
        });
        return true;
      }
    }

    return false;
  }

  /**
   * Check if we should close a hedge position based on mathematical profit/loss analysis
   */
  private shouldCloseHedge(hedgePosition: Position, currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    // Find the corresponding primary position
    const primaryPosition = this.currentPositions.find(pos => 
      pos.symbol === hedgePosition.symbol &&
      pos.side !== hedgePosition.side &&
      (pos.type === 'ANCHOR' || pos.type === 'OPPORTUNITY') &&
      pos.status === 'OPEN'
    );

    if (!primaryPosition) {
      // No primary position found - close hedge to avoid orphaned position
      logger.warn('⚠️ Closing orphaned hedge position - no primary position found', {
        hedgePositionId: hedgePosition.id,
        hedgeSide: hedgePosition.side,
        currentPrice: currentPrice.toFixed(4)
      });
      return true;
    }

    // Calculate PnL for both positions
    const primaryPnL = this.calculateProfitPercentage(primaryPosition, currentPrice);
    const hedgePnL = this.calculateProfitPercentage(hedgePosition, currentPrice);
    
    // Calculate leverage-adjusted PnL (hedge loses money faster due to higher leverage)
    const primaryLeverage = primaryPosition.leverage;
    const hedgeLeverage = hedgePosition.leverage;
    const leverageRatio = hedgeLeverage / primaryLeverage; // e.g., 15/10 = 1.5
    
    // Adjust hedge PnL for leverage difference (hedge loses 1.5x faster than primary gains)
    const leverageAdjustedHedgePnL = hedgePnL / leverageRatio;
    
    // Calculate total portfolio PnL with leverage adjustment
    const totalPnL = primaryPnL + leverageAdjustedHedgePnL;
    
    // Calculate fees impact (Binance Futures: 0.045% taker fees on notional value)
    // Fees are calculated on notional value (after leverage), not original balance
    const baseFees = 0.09; // 0.09% of notional value (0.045% + 0.045%)
    const estimatedFees = baseFees * leverageRatio; // Adjust for leverage difference
    
    // Mathematical hedge closure conditions (with leverage adjustment):
    
    // 1. Both positions are profitable (rare but possible)
    if (primaryPnL > 0 && hedgePnL > 0) {
      logger.info('💰 Both positions profitable - closing hedge for net profit', {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition.id,
        primaryPnL: primaryPnL.toFixed(2) + '%',
        hedgePnL: hedgePnL.toFixed(2) + '%',
        leverageRatio: leverageRatio.toFixed(2),
        leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
        totalPnL: totalPnL.toFixed(2) + '%',
        currentPrice: currentPrice.toFixed(4)
      });
      return true;
    }
    
    // 2. Leverage-adjusted hedge profit exceeds primary loss + fees
    if (leverageAdjustedHedgePnL > Math.abs(primaryPnL) + estimatedFees) {
      logger.info('🎯 Leverage-adjusted hedge profit exceeds primary loss + fees - closing hedge', {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition.id,
        primaryPnL: primaryPnL.toFixed(2) + '%',
        hedgePnL: hedgePnL.toFixed(2) + '%',
        leverageRatio: leverageRatio.toFixed(2),
        leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
        netBenefit: (leverageAdjustedHedgePnL - Math.abs(primaryPnL) - estimatedFees).toFixed(2) + '%',
        currentPrice: currentPrice.toFixed(4)
      });
      return true;
    }
    
    // 3. Primary position has recovered significantly (hedge served its purpose)
    if (primaryPnL > 1.0) { // Primary position is now 1%+ profitable
      logger.info('🔄 Primary position recovered - hedge served its purpose', {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition.id,
        primaryPnL: primaryPnL.toFixed(2) + '%',
        hedgePnL: hedgePnL.toFixed(2) + '%',
        leverageRatio: leverageRatio.toFixed(2),
        leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
        currentPrice: currentPrice.toFixed(4),
        reason: 'Primary position recovered - closing hedge to avoid unnecessary fees'
      });
      return true;
    }
    
    // 4. Price has returned to original primary entry price (hedge no longer needed)
    const priceTolerance = 0.002; // 0.2% tolerance
    if (Math.abs(currentPrice - primaryPosition.entryPrice) / primaryPosition.entryPrice <= priceTolerance) {
      logger.info('🎯 Price returned to primary entry - hedge no longer needed', {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition.id,
        primaryEntryPrice: primaryPosition.entryPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        primaryPnL: primaryPnL.toFixed(2) + '%',
        hedgePnL: hedgePnL.toFixed(2) + '%',
        leverageRatio: leverageRatio.toFixed(2),
        leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
        reason: 'Price at primary entry - hedge protection no longer needed'
      });
      return true;
    }
    
    // 5. Hedge is losing more than primary is gaining (leverage-adjusted analysis)
    const hedgeLossThreshold = -2.0 * leverageRatio; // Adjust threshold for leverage difference
    if (hedgePnL < hedgeLossThreshold && primaryPnL < 0) {
      logger.warn('⚠️ Leverage-adjusted hedge counterproductive - closing to prevent further losses', {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition.id,
        primaryPnL: primaryPnL.toFixed(2) + '%',
        hedgePnL: hedgePnL.toFixed(2) + '%',
        leverageRatio: leverageRatio.toFixed(2),
        leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
        hedgeLossThreshold: hedgeLossThreshold.toFixed(2) + '%',
        currentPrice: currentPrice.toFixed(4),
        reason: `Hedge losing ${leverageRatio.toFixed(2)}x faster than primary gains - closing to limit damage`
      });
      return true;
    }
    
    // 6. CRITICAL: Hedge immediately starts losing due to leverage difference
    if (hedgePnL < -0.5 && primaryPnL > 0) { // Hedge losing 0.5% while primary gaining
      const leverageAdjustedLoss = Math.abs(hedgePnL) * leverageRatio;
      const netLoss = leverageAdjustedLoss - primaryPnL;
      
      if (leverageAdjustedLoss > primaryPnL) {
        logger.error('🚨 CRITICAL: Hedge leverage causing immediate losses - closing immediately', {
          primaryPositionId: primaryPosition.id,
          hedgePositionId: hedgePosition.id,
          primaryPnL: primaryPnL.toFixed(2) + '%',
          hedgePnL: hedgePnL.toFixed(2) + '%',
          leverageRatio: leverageRatio.toFixed(2),
          leverageAdjustedLoss: leverageAdjustedLoss.toFixed(2) + '%',
          netLoss: netLoss.toFixed(2) + '%',
          estimatedFees: estimatedFees + '%',
          currentPrice: currentPrice.toFixed(4),
          reason: `Hedge losing ${leverageRatio.toFixed(2)}x faster than primary gains - net loss ${netLoss.toFixed(2)}% > fees ${estimatedFees}% - immediate closure required`
        });
        return true;
      }
    }
    
    // 7. CRITICAL: Net loss exceeds fees (hedge counterproductive)
    const netPortfolioLoss = Math.abs(totalPnL);
    if (totalPnL < 0 && netPortfolioLoss > estimatedFees) {
      logger.error('🚨 CRITICAL: Net portfolio loss exceeds fees - hedge counterproductive', {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition.id,
        primaryPnL: primaryPnL.toFixed(2) + '%',
        hedgePnL: hedgePnL.toFixed(2) + '%',
        leverageRatio: leverageRatio.toFixed(2),
        leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
        totalPnL: totalPnL.toFixed(2) + '%',
        netPortfolioLoss: netPortfolioLoss.toFixed(2) + '%',
        estimatedFees: estimatedFees + '%',
        currentPrice: currentPrice.toFixed(4),
        reason: `Net loss ${netPortfolioLoss.toFixed(2)}% > fees ${estimatedFees}% - hedge causing more damage than protection`
      });
      return true;
    }

    // Keep hedge open - it's still providing value
    logger.debug('🔒 Keeping hedge open - still providing protection', {
      primaryPositionId: primaryPosition.id,
      hedgePositionId: hedgePosition.id,
      primaryPnL: primaryPnL.toFixed(2) + '%',
      hedgePnL: hedgePnL.toFixed(2) + '%',
      leverageRatio: leverageRatio.toFixed(2),
      leverageAdjustedHedgePnL: leverageAdjustedHedgePnL.toFixed(2) + '%',
      totalPnL: totalPnL.toFixed(2) + '%',
      currentPrice: currentPrice.toFixed(4),
      reason: 'Hedge still providing value - keeping open (leverage-adjusted analysis)'
    });
    
    return false;
  }

  /**
   * Check if primary position should take profit at original target
   * This is the normal exit path when position reaches its intended target
   */
  private shouldTakeProfitPrimary(position: Position, currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    // Get the original take profit target based on position type
    let targetProfit: number;
    
    switch (position.type) {
      case 'ANCHOR':
        targetProfit = parseFloat(process.env.ANCHOR_TP_PERCENT || '1.0'); // 1% target for frequent trades
        break;
      case 'OPPORTUNITY':
        targetProfit = parseFloat(process.env.OPPORTUNITY_TP_PERCENT || '1.0'); // 1% target for frequent trades
        break;
      case 'SCALP':
        targetProfit = parseFloat(process.env.SCALP_HIGH_VOLUME_TP_PERCENT || '1.0'); // 1% target for frequent trades
        break;
      default:
        return false;
    }

    // Calculate current profit based on position size (1% target)
    const currentProfitBasedOnSize = this.calculateProfitBasedOnSize(position, currentPrice);
    
    // Check if we've reached the 1% profit target based on position size
    const hasReachedTarget = currentProfitBasedOnSize >= 100; // 100% means we've achieved 1% of position size
    
    if (hasReachedTarget) {
      logger.info('🎯 Primary Position Take Profit Target Reached (1% of Position Size)', {
        positionType: position.type,
        currentProfitBasedOnSize: currentProfitBasedOnSize.toFixed(2) + '%',
        targetProfit: '1.0% of position size',
        entryPrice: position.entryPrice,
        currentPrice: currentPrice,
        side: position.side,
        reason: 'Primary position reached 1% profit target based on position size - frequent trading exit'
      });
    }
    
    return hasReachedTarget;
  }

  /**
   * REMOVED: Early profit-taking logic
   * The hedge system handles all risk management
   * Early exits can cause unnecessary losses and fees
   */
  private shouldTakeProfitAnchor_REMOVED(anchorPosition: Position, currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    const profitThreshold = parseFloat(process.env.ANCHOR_TP_PERCENT || '1.0') / 100; // Use environment setting (default 1%)
    const currentProfit = this.calculateProfitPercentage(anchorPosition, currentPrice);
    
    // Only consider profit-taking if we have meaningful profit
    if (currentProfit < profitThreshold) {
      return false;
    }

    // 🎯 PRIORITY 1: Check if price has returned to original exit target
    const originalTarget = this.getOriginalExitTarget(anchorPosition);
    if (originalTarget && this.isPriceAtTarget(currentPrice, originalTarget, anchorPosition)) {
      logger.info('🎯 Target Return Exit: Price returned to original target', {
        position: `ANCHOR_${anchorPosition.side}`,
        entryPrice: anchorPosition.entryPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        originalTarget: originalTarget.toFixed(4),
        profit: `${currentProfit.toFixed(2)}%`,
        reason: 'Price returned to original exit target - capturing achieved profit'
      });
      return true;
    }

    // Get comprehensive trading signals
    const signals = this.comprehensiveLevels.getTradingSignals(currentPrice);
    
    if (anchorPosition.side === 'LONG') {
      // For LONG positions: Take profit at resistance levels
      const nearestResistance = signals.nearestResistance;
      
      if (nearestResistance) {
        // Check if we're near a high-importance resistance level (within 0.5%)
        const priceTolerance = 0.005; // 0.5% tolerance
        const isNearResistance = Math.abs(currentPrice - nearestResistance.price) / nearestResistance.price <= priceTolerance;
        const isAboveResistance = currentPrice >= nearestResistance.price;
        
        if ((isNearResistance || isAboveResistance) && (nearestResistance.importance === 'HIGH' || nearestResistance.importance === 'CRITICAL')) {
          // Primary confirmation: RSI overbought or volume decreasing
          const rsiOverbought = indicators1h.rsi > 70;
          const volumeDecreasing = indicators1h.volumeRatio < 0.1; // Match entry volume threshold
          
          // Fallback: Price peak detection (price has peaked and started declining)
          const pricePeakDetected = this.detectPricePeak(anchorPosition, currentPrice);
          
          if (rsiOverbought || volumeDecreasing || pricePeakDetected) {
            logger.info('🎯 LONG Anchor Profit-Taking Signal', {
              position: 'ANCHOR_LONG',
              entryPrice: anchorPosition.entryPrice.toFixed(4),
              currentPrice: currentPrice.toFixed(4),
              profit: `${currentProfit.toFixed(2)}%`,
              resistanceLevel: nearestResistance.price.toFixed(4),
              description: nearestResistance.description,
              importance: nearestResistance.importance,
              isNearResistance,
              isAboveResistance,
              rsiOverbought,
              volumeDecreasing,
              pricePeakDetected,
              exitReason: pricePeakDetected ? 'Price peak detected' : (rsiOverbought ? 'RSI overbought' : 'Volume decreasing')
            });
            return true;
          }
        }
      }
    } else if (anchorPosition.side === 'SHORT') {
      // For SHORT positions: Take profit at support levels
      const nearestSupport = signals.nearestSupport;
      
      if (nearestSupport) {
        // Check if we're near a high-importance support level (within 0.5%)
        const priceTolerance = 0.005; // 0.5% tolerance
        const isNearSupport = Math.abs(currentPrice - nearestSupport.price) / nearestSupport.price <= priceTolerance;
        const isBelowSupport = currentPrice <= nearestSupport.price;
        
        if ((isNearSupport || isBelowSupport) && (nearestSupport.importance === 'HIGH' || nearestSupport.importance === 'CRITICAL')) {
          // Primary confirmation: RSI oversold or volume decreasing
          const rsiOversold = indicators1h.rsi < 30;
          const volumeDecreasing = indicators1h.volumeRatio < 0.1; // Match entry volume threshold
          
          // Fallback: Price trough detection (price has bottomed and started rising)
          const priceTroughDetected = this.detectPriceTrough(anchorPosition, currentPrice);
          
          if (rsiOversold || volumeDecreasing || priceTroughDetected) {
            logger.info('🎯 SHORT Anchor Profit-Taking Signal', {
              position: 'ANCHOR_SHORT',
              entryPrice: anchorPosition.entryPrice.toFixed(4),
              currentPrice: currentPrice.toFixed(4),
              profit: `${currentProfit.toFixed(2)}%`,
              supportLevel: nearestSupport.price.toFixed(4),
              description: nearestSupport.description,
              importance: nearestSupport.importance,
              isNearSupport,
              isBelowSupport,
              rsiOversold,
              volumeDecreasing,
              priceTroughDetected,
              exitReason: priceTroughDetected ? 'Price trough detected' : (rsiOversold ? 'RSI oversold' : 'Volume decreasing')
            });
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * REMOVED: Early profit-taking logic
   * The hedge system handles all risk management
   * Early exits can cause unnecessary losses and fees
   */
  private shouldTakeProfitOpportunity_REMOVED(peakPosition: Position, currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    const profitThreshold = parseFloat(process.env.OPPORTUNITY_TP_PERCENT || '1.0') / 100; // Use environment setting (default 1%)
    const currentProfit = this.calculateProfitPercentage(peakPosition, currentPrice);
    
    // Only consider profit-taking if we have meaningful profit
    if (currentProfit < profitThreshold) {
      return false;
    }

    // 🎯 PRIORITY 1: Check if price has returned to original exit target
    const originalTarget = this.getOriginalExitTarget(peakPosition);
    if (originalTarget && this.isPriceAtTarget(currentPrice, originalTarget, peakPosition)) {
      logger.info('🎯 Target Return Exit: Price returned to original target', {
        position: `PEAK_${peakPosition.side}`,
        entryPrice: peakPosition.entryPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        originalTarget: originalTarget.toFixed(4),
        profit: `${currentProfit.toFixed(2)}%`,
        reason: 'Price returned to original exit target - capturing achieved profit'
      });
      return true;
    }

    // Get comprehensive trading signals
    const signals = this.comprehensiveLevels.getTradingSignals(currentPrice);
    
    if (peakPosition.side === 'LONG') {
      // For LONG peak: Take profit at resistance levels
      const nearestResistance = signals.nearestResistance;
      
      if (nearestResistance) {
        // Check if we're near a medium+ importance resistance level (within 0.5%)
        const priceTolerance = 0.005; // 0.5% tolerance
        const isNearResistance = Math.abs(currentPrice - nearestResistance.price) / nearestResistance.price <= priceTolerance;
        const isAboveResistance = currentPrice >= nearestResistance.price;
        
        // More aggressive profit-taking for peak positions
        const isMediumImportance = nearestResistance.importance === 'MEDIUM' || 
                                 nearestResistance.importance === 'HIGH' || 
                                 nearestResistance.importance === 'CRITICAL';
        
        // Primary confirmation: RSI overbought or volume decreasing
        const rsiOverbought = indicators1h.rsi > 75;
        const volumeDecreasing = indicators1h.volumeRatio < 0.1; // Match entry volume threshold
        
        // Fallback: Price peak detection (price has peaked and started declining)
        const pricePeakDetected = this.detectOpportunityPricePeak(peakPosition, currentPrice);
        
        if ((isNearResistance || isAboveResistance) && isMediumImportance && (rsiOverbought || volumeDecreasing || pricePeakDetected)) {
          logger.info('🎯 LONG Peak Profit-Taking Signal', {
            position: 'PEAK_LONG',
            entryPrice: peakPosition.entryPrice.toFixed(4),
            currentPrice: currentPrice.toFixed(4),
            profit: `${currentProfit.toFixed(2)}%`,
            resistanceLevel: nearestResistance.price.toFixed(4),
            description: nearestResistance.description,
            importance: nearestResistance.importance,
            isNearResistance,
            isAboveResistance,
            rsiOverbought,
            volumeDecreasing,
            pricePeakDetected,
            exitReason: pricePeakDetected ? 'Price peak detected' : (rsiOverbought ? 'RSI overbought' : 'Volume decreasing')
          });
          return true;
        }
      }
    } else if (peakPosition.side === 'SHORT') {
      // For SHORT peak: Take profit at support levels
      const nearestSupport = signals.nearestSupport;
      
      if (nearestSupport) {
        // Check if we're near a medium+ importance support level (within 0.5%)
        const priceTolerance = 0.005; // 0.5% tolerance
        const isNearSupport = Math.abs(currentPrice - nearestSupport.price) / nearestSupport.price <= priceTolerance;
        const isBelowSupport = currentPrice <= nearestSupport.price;
        
        // More aggressive profit-taking for peak positions
        const isMediumImportance = nearestSupport.importance === 'MEDIUM' || 
                                 nearestSupport.importance === 'HIGH' || 
                                 nearestSupport.importance === 'CRITICAL';
        
        // Primary confirmation: RSI oversold or volume decreasing
        const rsiOversold = indicators1h.rsi < 25;
        const volumeDecreasing = indicators1h.volumeRatio < 0.1; // Match entry volume threshold
        
        // Fallback: Price trough detection (price has bottomed and started rising)
        const priceTroughDetected = this.detectOpportunityPriceTrough(peakPosition, currentPrice);
        
        if ((isNearSupport || isBelowSupport) && isMediumImportance && (rsiOversold || volumeDecreasing || priceTroughDetected)) {
          logger.info('🎯 SHORT Peak Profit-Taking Signal', {
            position: 'PEAK_SHORT',
            entryPrice: peakPosition.entryPrice.toFixed(4),
            currentPrice: currentPrice.toFixed(4),
            profit: `${currentProfit.toFixed(2)}%`,
            supportLevel: nearestSupport.price.toFixed(4),
            description: nearestSupport.description,
            importance: nearestSupport.importance,
            isNearSupport,
            isBelowSupport,
            rsiOversold,
            volumeDecreasing,
            priceTroughDetected,
            exitReason: priceTroughDetected ? 'Price trough detected' : (rsiOversold ? 'RSI oversold' : 'Volume decreasing')
          });
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate profit percentage for a position
   */
  private calculateProfitPercentage(position: Position, currentPrice: number): number {
    if (position.side === 'LONG') {
      return ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
    } else {
      return ((position.entryPrice - currentPrice) / position.entryPrice) * 100;
    }
  }

  /**
   * Calculate profit based on position size (1% of position size)
   * This is the new method for frequent trading with 1% profit target
   */
  private calculateProfitBasedOnSize(position: Position, currentPrice: number): number {
    const positionSize = position.size || position.quantity;
    const leverage = position.leverage;
    
    // Calculate the notional value of the position
    const notionalValue = positionSize * position.entryPrice * leverage;
    
    // Calculate current PnL in absolute terms
    let priceChange;
    if (position.side === 'LONG') {
      priceChange = currentPrice - position.entryPrice;
    } else {
      priceChange = position.entryPrice - currentPrice;
    }
    
    const currentPnL = (priceChange / position.entryPrice) * notionalValue;
    
    // Calculate 1% of position size as target profit
    const targetProfitAmount = notionalValue * 0.01; // 1% of position size
    
    // Return the percentage of target profit achieved
    return (currentPnL / targetProfitAmount) * 100;
  }

  /**
   * Calculate absolute dollar profit/loss for a position
   */
  private calculateAbsoluteProfit(position: Position, currentPrice: number): number {
    const notionalValue = (position.size || position.quantity) * position.entryPrice;
    const profitPercentage = this.calculateProfitPercentage(position, currentPrice) / 100;
    return notionalValue * profitPercentage;
  }

  /**
   * Check if hedge should exit based on liquidation-based strategy
   */
  private shouldExitHedgeForProfit(anchorPosition: Position, hedgePosition: Position, currentPrice: number): boolean {
    // Get anchor liquidation price
    const anchorLiquidationPrice = this.calculateLiquidationPrice(anchorPosition);
    
    // Check if we're approaching anchor liquidation (within 1% of liquidation price)
    const liquidationBuffer = 0.01; // 1% buffer before liquidation
    const liquidationThreshold = anchorLiquidationPrice * (1 + liquidationBuffer);
    
    if (anchorPosition.side === 'LONG' && currentPrice <= liquidationThreshold) {
      // LONG approaching liquidation - check if SHORT has enough profit to cover loss
      const anchorLoss = this.calculateAbsoluteProfit(anchorPosition, anchorLiquidationPrice);
      const hedgeProfit = this.calculateAbsoluteProfit(hedgePosition, currentPrice);
      
      // Exit if hedge profit exceeds anchor loss at liquidation
      const netProfit = hedgeProfit + anchorLoss; // anchorLoss is negative
      
      if (netProfit > 0) {
        logger.info('🎯 Liquidation-Based Exit - Guaranteed Profit', {
          anchorLiquidation: anchorLiquidationPrice.toFixed(4),
          currentPrice: currentPrice.toFixed(4),
          liquidationBuffer: `${(liquidationBuffer * 100).toFixed(1)}%`,
          anchorLossAtLiquidation: anchorLoss.toFixed(2),
          hedgeProfit: hedgeProfit.toFixed(2),
          netProfit: netProfit.toFixed(2),
          strategy: 'Liquidation-based hedge exit'
        });
        return true;
      }
    }
    
    // Check for double profit scenario - hedge TP hit and price returning
    if (this.isHedgeTakeProfitHit(hedgePosition, currentPrice) && this.isPriceReturningToSupport(anchorPosition, currentPrice)) {
      logger.info('🚀 Double Profit Scenario - Hedge TP Hit', {
        hedgeEntry: hedgePosition.entryPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        hedgeProfit: this.calculateAbsoluteProfit(hedgePosition, currentPrice).toFixed(2),
        strategy: 'Double profit - hedge TP achieved'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Calculate liquidation price for a position
   */
  private calculateLiquidationPrice(position: Position): number {
    // Simplified liquidation calculation (Binance uses more complex formula)
    const leverage = position.leverage || 10;
    const marginRatio = 1 / leverage;
    
    if (position.side === 'LONG') {
      return position.entryPrice * (1 - marginRatio);
    } else {
      return position.entryPrice * (1 + marginRatio);
    }
  }

  /**
   * Check if hedge take profit is hit
   */
  private isHedgeTakeProfitHit(hedgePosition: Position, currentPrice: number): boolean {
    // Check if hedge has achieved significant profit using environment setting
    const profitPercentage = this.calculateProfitPercentage(hedgePosition, currentPrice);
    const hedgeProfitThreshold = parseFloat(process.env.HEDGE_TP_PERCENT || process.env.ANCHOR_TP_PERCENT || '1.0');
    return profitPercentage >= hedgeProfitThreshold; // Use environment setting (default 1%)
  }

  /**
   * Check if price is returning to support (for double profit scenario)
   */
  private isPriceReturningToSupport(anchorPosition: Position, currentPrice: number): boolean {
    if (anchorPosition.side === 'LONG') {
      // For LONG anchor, check if price is returning above support levels
      const supportLevels = this.dynamicLevels.getSupportLevels();
      const nearestSupport = supportLevels.find(level => level.price < currentPrice);
      
      if (nearestSupport) {
        const priceTolerance = 0.005; // 0.5% tolerance
        return Math.abs(currentPrice - nearestSupport.price) / nearestSupport.price <= priceTolerance;
      }
    }
    
    return false;
  }

  /**
   * Check if we should open a Peak reversal position
   * 🎯 NEW LOGIC: Opens whenever peak is detected, but not if existing position in same direction
   * 🎯 BIDIRECTIONAL: Detects both peaks (SHORT) and troughs (LONG)
   */
  private shouldOpenPeakReversal(
    currentPrice: number, 
    indicators4h: TechnicalIndicators, 
    indicators1h: TechnicalIndicators
  ): boolean {
    // Check if we already have a peak position
    const hasPeakPosition = this.currentPositions.some(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
    if (hasPeakPosition) return false;

    // 🎯 BIDIRECTIONAL PEAK DETECTION - Independent of existing positions
    let peakDirection: 'LONG' | 'SHORT' | null = null;
    
    // Detect SHORT peak (market peaked and declining)
    if (this.detectMarketPeak(currentPrice, indicators1h)) {
      peakDirection = 'SHORT';
    }
    
    // Detect LONG peak (market bottomed and rising)
    if (this.detectMarketTrough(currentPrice, indicators1h)) {
      peakDirection = 'LONG';
    }
    
    if (!peakDirection) return false;
    
    // 🛡️ SAFETY RULE: Don't open if we already have a position in the same direction
    const existingSameDirection = this.currentPositions.some(pos => 
      pos.side === peakDirection && pos.status === 'OPEN'
    );
    
    if (existingSameDirection) {
      logger.info('🚫 Peak Strategy Blocked: Existing position in same direction', {
        peakDirection,
        existingPositions: this.currentPositions.filter(p => p.status === 'OPEN').map(p => `${p.type}_${p.side}`),
        reason: 'Peak positions only open when no existing position in same direction'
      });
      return false;
    }
    
    // Log the peak detection
    if (peakDirection === 'SHORT') {
      logger.info('🎯 SHORT Peak Reversal Signal', {
        peakPrice: currentPrice.toFixed(4),
        reason: 'Market peaked and declining - opening SHORT peak position'
      });
    } else {
      logger.info('🎯 LONG Peak Reversal Signal', {
        troughPrice: currentPrice.toFixed(4),
        reason: 'Market bottomed and rising - opening LONG peak position'
      });
    }
    
    return true;
  }

  /**
   * Calculate signal confidence based on multiple factors
   */
  private calculateConfidence(indicators4h: TechnicalIndicators, indicators1h: TechnicalIndicators): number {
    let confidence = 0.5; // Base confidence

    // Volume confirmation adds confidence
    if (this.technicalAnalysis.isVolumeAboveThreshold(indicators1h.volumeRatio)) {
      confidence += 0.2;
    }

    // RSI in valid range adds confidence
    if (this.technicalAnalysis.isRSIInValidRange(indicators1h.rsi)) {
      confidence += 0.1;
    }

    // Trend alignment adds confidence
    if (indicators4h.trend === 'BULLISH') {
      confidence += 0.2;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Update current positions
   */
  updatePositions(positions: Position[]): void {
    this.currentPositions = positions;
  }

  /**
   * Get current positions
   */
  getCurrentPositions(): Position[] {
    return this.currentPositions;
  }

  /**
   * Toggle dynamic levels usage
   */
  toggleDynamicLevels(): void {
    this.useDynamicLevels = !this.useDynamicLevels;
    logger.info(`Dynamic levels ${this.useDynamicLevels ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get dynamic levels information
   */
  getDynamicLevelsInfo(): {
    enabled: boolean;
    stats: any;
    supportLevels: any[];
    resistanceLevels: any[];
  } {
    return {
      enabled: this.useDynamicLevels,
      stats: this.dynamicLevels.getLevelStats(),
      supportLevels: this.dynamicLevels.getSupportLevels(),
      resistanceLevels: this.dynamicLevels.getResistanceLevels()
    };
  }

  /**
   * Get current support levels (for monitoring)
   */
  getSupportLevels(): number[] {
    if (this.useDynamicLevels) {
      return this.dynamicLevels.getSupportLevels().map(level => level.price);
    } else {
      return [
        this.supportResistanceLevels.support1,
        this.supportResistanceLevels.support2,
        this.supportResistanceLevels.support3
      ];
    }
  }

  /**
   * Get current resistance levels (for monitoring)
   */
  getResistanceLevels(): number[] {
    if (this.useDynamicLevels) {
      return this.dynamicLevels.getResistanceLevels().map(level => level.price);
    } else {
      return [
        this.supportResistanceLevels.resistance1,
        this.supportResistanceLevels.resistance2,
        this.supportResistanceLevels.resistance3
      ];
    }
  }

  /**
   * Get comprehensive level information
   */
  getComprehensiveLevelsInfo(currentPrice: number): any {
    return this.comprehensiveLevels.getTradingSignals(currentPrice);
  }

  /**
   * Log comprehensive levels information
   */
  logComprehensiveLevels(currentPrice: number): void {
    this.comprehensiveLevels.logLevelsInfo(currentPrice);
  }

  /**
   * Detect if price has peaked and started declining (for LONG positions)
   * This is a fallback mechanism when RSI/volume conditions aren't met
   */
  private detectPricePeak(position: Position, currentPrice: number): boolean {
    // Store price history for peak detection
    if (!this.priceHistory) {
      this.priceHistory = new Map();
    }
    
    const positionKey = `${position.id}_${position.side}`;
    if (!this.priceHistory.has(positionKey)) {
      this.priceHistory.set(positionKey, []);
    }
    
    const history = this.priceHistory.get(positionKey)!;
    history.push({ price: currentPrice, timestamp: Date.now() });
    
    // Keep only last 10 price points (about 5 minutes of data)
    if (history.length > 10) {
      history.shift();
    }
    
    // Need at least 3 data points to detect a peak
    if (history.length < 3) {
      return false;
    }
    
    // Check if we have a peak pattern: price went up, then started declining
    const recent = history.slice(-3);
    const [first, second, third] = recent;
    
    // Ensure we have all three data points
    if (!first || !second || !third) {
      return false;
    }
    
    // Peak detection: second price is highest, third is lower
    const isPeak = second.price > first.price && third.price < second.price;
    
    // Additional condition: current price should be at least 0.3% below the peak
    const peakDecline = (second.price - currentPrice) / second.price >= 0.003; // 0.3% decline
    
    if (isPeak && peakDecline) {
      logger.info('🔍 Price Peak Detected', {
        position: position.side,
        entryPrice: position.entryPrice.toFixed(4),
        peakPrice: second.price.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        decline: `${((second.price - currentPrice) / second.price * 100).toFixed(2)}%`,
        reason: 'Price peaked and started declining'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect if price has bottomed and started rising (for SHORT positions)
   * This is a fallback mechanism when RSI/volume conditions aren't met
   */
  private detectPriceTrough(position: Position, currentPrice: number): boolean {
    // Store price history for trough detection
    if (!this.priceHistory) {
      this.priceHistory = new Map();
    }
    
    const positionKey = `${position.id}_${position.side}`;
    if (!this.priceHistory.has(positionKey)) {
      this.priceHistory.set(positionKey, []);
    }
    
    const history = this.priceHistory.get(positionKey)!;
    history.push({ price: currentPrice, timestamp: Date.now() });
    
    // Keep only last 10 price points (about 5 minutes of data)
    if (history.length > 10) {
      history.shift();
    }
    
    // Need at least 3 data points to detect a trough
    if (history.length < 3) {
      return false;
    }
    
    // Check if we have a trough pattern: price went down, then started rising
    const recent = history.slice(-3);
    const [first, second, third] = recent;
    
    // Ensure we have all three data points
    if (!first || !second || !third) {
      return false;
    }
    
    // Trough detection: second price is lowest, third is higher
    const isTrough = second.price < first.price && third.price > second.price;
    
    // Additional condition: current price should be at least 0.3% above the trough
    const troughRise = (currentPrice - second.price) / second.price >= 0.003; // 0.3% rise
    
    if (isTrough && troughRise) {
      logger.info('🔍 Price Trough Detected', {
        position: position.side,
        entryPrice: position.entryPrice.toFixed(4),
        troughPrice: second.price.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        rise: `${((currentPrice - second.price) / second.price * 100).toFixed(2)}%`,
        reason: 'Price bottomed and started rising'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect if price has peaked and started declining (for LONG opportunity positions)
   * This is a fallback mechanism when RSI/volume conditions aren't met
   */
  private detectOpportunityPricePeak(position: Position, currentPrice: number): boolean {
    // Store price history for peak detection
    if (!this.priceHistory) {
      this.priceHistory = new Map();
    }
    
    const positionKey = `opportunity_${position.id}_${position.side}`;
    if (!this.priceHistory.has(positionKey)) {
      this.priceHistory.set(positionKey, []);
    }
    
    const history = this.priceHistory.get(positionKey)!;
    history.push({ price: currentPrice, timestamp: Date.now() });
    
    // Keep only last 10 price points (about 5 minutes of data)
    if (history.length > 10) {
      history.shift();
    }
    
    // Need at least 3 data points to detect a peak
    if (history.length < 3) {
      return false;
    }
    
    // Check if we have a peak pattern: price went up, then started declining
    const recent = history.slice(-3);
    const [first, second, third] = recent;
    
    // Ensure we have all three data points
    if (!first || !second || !third) {
      return false;
    }
    
    // Peak detection: second price is highest, third is lower
    const isPeak = second.price > first.price && third.price < second.price;
    
    // Additional condition: current price should be at least 0.3% below the peak
    const peakDecline = (second.price - currentPrice) / second.price >= 0.003; // 0.3% decline
    
    if (isPeak && peakDecline) {
      logger.info('🔍 Opportunity Price Peak Detected', {
        position: `OPPORTUNITY_${position.side}`,
        entryPrice: position.entryPrice.toFixed(4),
        peakPrice: second.price.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        decline: `${((second.price - currentPrice) / second.price * 100).toFixed(2)}%`,
        reason: 'Opportunity price peaked and started declining'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect if price has bottomed and started rising (for SHORT opportunity positions)
   * This is a fallback mechanism when RSI/volume conditions aren't met
   */
  private detectOpportunityPriceTrough(position: Position, currentPrice: number): boolean {
    // Store price history for trough detection
    if (!this.priceHistory) {
      this.priceHistory = new Map();
    }
    
    const positionKey = `opportunity_${position.id}_${position.side}`;
    if (!this.priceHistory.has(positionKey)) {
      this.priceHistory.set(positionKey, []);
    }
    
    const history = this.priceHistory.get(positionKey)!;
    history.push({ price: currentPrice, timestamp: Date.now() });
    
    // Keep only last 10 price points (about 5 minutes of data)
    if (history.length > 10) {
      history.shift();
    }
    
    // Need at least 3 data points to detect a trough
    if (history.length < 3) {
      return false;
    }
    
    // Check if we have a trough pattern: price went down, then started rising
    const recent = history.slice(-3);
    const [first, second, third] = recent;
    
    // Ensure we have all three data points
    if (!first || !second || !third) {
      return false;
    }
    
    // Trough detection: second price is lowest, third is higher
    const isTrough = second.price < first.price && third.price > second.price;
    
    // Additional condition: current price should be at least 0.3% above the trough
    const troughRise = (currentPrice - second.price) / second.price >= 0.003; // 0.3% rise
    
    if (isTrough && troughRise) {
      logger.info('🔍 Opportunity Price Trough Detected', {
        position: `OPPORTUNITY_${position.side}`,
        entryPrice: position.entryPrice.toFixed(4),
        troughPrice: second.price.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        rise: `${((currentPrice - second.price) / second.price * 100).toFixed(2)}%`,
        reason: 'Opportunity price bottomed and started rising'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Get the original exit target for a position based on its entry signal
   * This is the price level that was identified as the initial profit target
   */
  private getOriginalExitTarget(position: Position): number | null {
    // For anchor positions, the original target is typically the next resistance/support level
    // We'll use the comprehensive levels system to determine this
    
    if (position.type === 'ANCHOR') {
      if (position.side === 'LONG') {
        // For LONG anchor, target is the next resistance level above entry
        const signals = this.comprehensiveLevels.getTradingSignals(position.entryPrice);
        return signals.nearestResistance?.price || null;
      } else {
        // For SHORT anchor, target is the next support level below entry
        const signals = this.comprehensiveLevels.getTradingSignals(position.entryPrice);
        return signals.nearestSupport?.price || null;
      }
    }
    
    if (position.type === 'OPPORTUNITY') {
      if (position.side === 'LONG') {
        // For LONG opportunity, target is the next resistance level above entry
        const signals = this.comprehensiveLevels.getTradingSignals(position.entryPrice);
        return signals.nearestResistance?.price || null;
      } else {
        // For SHORT opportunity, target is the next support level below entry
        const signals = this.comprehensiveLevels.getTradingSignals(position.entryPrice);
        return signals.nearestSupport?.price || null;
      }
    }
    
    return null;
  }

  /**
   * Check if current price is at or near the original exit target
   * FIXED: Exit immediately when target is reached (Option 1)
   */
  private isPriceAtTarget(currentPrice: number, targetPrice: number, position: Position): boolean {
    const priceTolerance = 0.005; // 0.5% tolerance
    const isNearTarget = Math.abs(currentPrice - targetPrice) / targetPrice <= priceTolerance;
    
    if (!isNearTarget) {
      return false;
    }
    
    // Exit immediately when target is reached
    if (position.side === 'LONG' && currentPrice >= targetPrice) {
      logger.info('🎯 Target reached - exiting immediately', {
        position: `ANCHOR_${position.side}`,
        entryPrice: position.entryPrice.toFixed(4),
        targetPrice: targetPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        reason: 'Price reached target - exiting immediately for guaranteed profit'
      });
      return true;
    }
    
    if (position.side === 'SHORT' && currentPrice <= targetPrice) {
      logger.info('🎯 Target reached - exiting immediately', {
        position: `ANCHOR_${position.side}`,
        entryPrice: position.entryPrice.toFixed(4),
        targetPrice: targetPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        reason: 'Price reached target - exiting immediately for guaranteed profit'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect if market has peaked and is reversing (for SHORT Peak positions)
   * This detects when price has reached a peak and started declining
   */
  private detectMarketPeak(currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    // Store market price history for peak detection
    if (!this.priceHistory) {
      this.priceHistory = new Map();
    }
    
    const marketKey = 'market_peak_detection';
    if (!this.priceHistory.has(marketKey)) {
      this.priceHistory.set(marketKey, []);
    }
    
    const history = this.priceHistory.get(marketKey)!;
    history.push({ price: currentPrice, timestamp: Date.now() });
    
    // Keep only last 10 price points (about 10 minutes of data)
    if (history.length > 10) {
      history.shift();
    }
    
    // Need at least 5 data points to detect a peak
    if (history.length < 5) {
      return false;
    }
    
    // Check if we have a peak pattern: price went up, peaked, then started declining
    const recent = history.slice(-5);
    const [first, second, third, fourth, fifth] = recent;
    
    // Ensure we have all five data points
    if (!first || !second || !third || !fourth || !fifth) {
      return false;
    }
    
    // Peak detection: price went up, peaked, then started declining
    const isPeak = second.price > first.price && 
                   third.price > second.price && 
                   fourth.price < third.price && 
                   fifth.price < fourth.price;
    
    // Additional confirmation: RSI overbought and declining
    const rsiOverbought = indicators1h.rsi > 70;
    const rsiDeclining = this.isRSIDeclining(indicators1h);
    
    // Volume confirmation: volume decreasing (momentum shift)
    const volumeDecreasing = indicators1h.volumeRatio < 0.8;
    
    // Minimum peak decline: at least 0.3% decline from peak
    const peakPrice = third.price;
    const peakDecline = (peakPrice - currentPrice) / peakPrice >= 0.003; // 0.3% decline
    
    if (isPeak && rsiOverbought && rsiDeclining && volumeDecreasing && peakDecline) {
      logger.info('🔍 Market Peak Detected - SHORT Peak Opportunity', {
        peakPrice: peakPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        decline: `${((peakPrice - currentPrice) / peakPrice * 100).toFixed(2)}%`,
        rsi: indicators1h.rsi.toFixed(1),
        volumeRatio: indicators1h.volumeRatio.toFixed(2),
        reason: 'Market peaked and declining - SHORT reversal opportunity'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Detect if market has bottomed and is reversing (for LONG Peak positions)
   * This detects when price has reached a trough and started rising
   */
  private detectMarketTrough(currentPrice: number, indicators1h: TechnicalIndicators): boolean {
    // Store market price history for trough detection
    if (!this.priceHistory) {
      this.priceHistory = new Map();
    }
    
    const marketKey = 'market_trough_detection';
    if (!this.priceHistory.has(marketKey)) {
      this.priceHistory.set(marketKey, []);
    }
    
    const history = this.priceHistory.get(marketKey)!;
    history.push({ price: currentPrice, timestamp: Date.now() });
    
    // Keep only last 10 price points (about 10 minutes of data)
    if (history.length > 10) {
      history.shift();
    }
    
    // Need at least 5 data points to detect a trough
    if (history.length < 5) {
      return false;
    }
    
    // Check if we have a trough pattern: price went down, bottomed, then started rising
    const recent = history.slice(-5);
    const [first, second, third, fourth, fifth] = recent;
    
    // Ensure we have all five data points
    if (!first || !second || !third || !fourth || !fifth) {
      return false;
    }
    
    // Trough detection: price went down, bottomed, then started rising
    const isTrough = second.price < first.price && 
                     third.price < second.price && 
                     fourth.price > third.price && 
                     fifth.price > fourth.price;
    
    // Additional confirmation: RSI oversold and rising
    const rsiOversold = indicators1h.rsi < 30;
    const rsiRising = this.isRSIRising(indicators1h);
    
    // Volume confirmation: volume increasing (momentum shift)
    const volumeIncreasing = indicators1h.volumeRatio > 1.2;
    
    // Minimum trough rise: at least 0.3% rise from trough
    const troughPrice = third.price;
    const troughRise = (currentPrice - troughPrice) / troughPrice >= 0.003; // 0.3% rise
    
    if (isTrough && rsiOversold && rsiRising && volumeIncreasing && troughRise) {
      logger.info('🔍 Market Trough Detected - LONG Peak Opportunity', {
        troughPrice: troughPrice.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        rise: `${((currentPrice - troughPrice) / troughPrice * 100).toFixed(2)}%`,
        rsi: indicators1h.rsi.toFixed(1),
        volumeRatio: indicators1h.volumeRatio.toFixed(2),
        reason: 'Market bottomed and rising - LONG reversal opportunity'
      });
      return true;
    }
    
    return false;
  }

  /**
   * Check if RSI is declining (for peak detection)
   */
  private isRSIDeclining(indicators1h: TechnicalIndicators): boolean {
    // Simple RSI declining check - in real implementation, you'd track RSI history
    // For now, we'll use the current RSI value and assume it's declining if overbought
    return indicators1h.rsi > 70; // RSI overbought suggests potential decline
  }

  /**
   * Check if RSI is rising (for trough detection)
   */
  private isRSIRising(indicators1h: TechnicalIndicators): boolean {
    // Simple RSI rising check - in real implementation, you'd track RSI history
    // For now, we'll use the current RSI value and assume it's rising if oversold
    return indicators1h.rsi < 30; // RSI oversold suggests potential rise
  }

  /**
   * Determine if signal should be executed based on AI analysis
   */
  private shouldExecuteSignalWithAI(signal: TradingSignal, aiAnalysis?: AIAnalysisResult | null): boolean {
    if (!aiAnalysis) {
      return true; // Execute if no AI analysis available
    }

    // Check for extreme risk conditions
    if (aiAnalysis.riskAssessment.overallRisk === 'EXTREME') {
      logger.warn('🤖 Signal blocked: Extreme market risk detected');
      return false;
    }

    // Check sentiment alignment
    const sentimentScore = aiAnalysis.sentiment.sentimentScore;
    if (signal.position === 'LONG' && sentimentScore < -0.3) {
      logger.warn('🤖 Signal blocked: Bearish sentiment opposes LONG position');
      return false;
    }
    if (signal.position === 'SHORT' && sentimentScore > 0.3) {
      logger.warn('🤖 Signal blocked: Bullish sentiment opposes SHORT position');
      return false;
    }

    // Check market regime alignment
    const regime = aiAnalysis.marketRegime.regime;
    if (signal.position === 'LONG' && regime === 'TRENDING_BEAR') {
      logger.warn('🤖 Signal blocked: Bear market regime opposes LONG position');
      return false;
    }
    if (signal.position === 'SHORT' && regime === 'TRENDING_BULL') {
      logger.warn('🤖 Signal blocked: Bull market regime opposes SHORT position');
      return false;
    }

    // Check overall AI confidence
    if (aiAnalysis.overallConfidence < 0.3) {
      logger.warn('🤖 Signal blocked: Low AI confidence');
      return false;
    }

    // Check trading recommendation
    const recommendation = aiAnalysis.tradingRecommendation;
    if (signal.position === 'LONG' && (recommendation === 'SELL' || recommendation === 'STRONG_SELL')) {
      logger.warn('🤖 Signal blocked: AI recommends SELL');
      return false;
    }
    if (signal.position === 'SHORT' && (recommendation === 'BUY' || recommendation === 'STRONG_BUY')) {
      logger.warn('🤖 Signal blocked: AI recommends BUY');
      return false;
    }

    // Check risk-adjusted confidence
    const riskAdjustedConfidence = signal.confidence * (1 - aiAnalysis.riskAssessment.riskScore);
    if (riskAdjustedConfidence < 0.4) {
      logger.warn('🤖 Signal blocked: Risk-adjusted confidence too low', { 
        originalConfidence: signal.confidence,
        riskScore: aiAnalysis.riskAssessment.riskScore,
        riskAdjustedConfidence 
      });
      return false;
    }

    logger.info('🤖 Signal approved by AI analysis', {
      signalType: signal.type,
      position: signal.position,
      aiConfidence: aiAnalysis.overallConfidence,
      sentiment: aiAnalysis.sentiment.overallSentiment,
      regime: aiAnalysis.marketRegime.regime,
      risk: aiAnalysis.riskAssessment.overallRisk
    });

    return true;
  }

  /**
   * Get AI filter reason for logging
   */
  private getAIFilterReason(signal: TradingSignal, aiAnalysis?: AIAnalysisResult | null): string {
    if (!aiAnalysis) {
      return 'No AI analysis available';
    }

    if (aiAnalysis.riskAssessment.overallRisk === 'EXTREME') {
      return 'Extreme market risk';
    }

    const sentimentScore = aiAnalysis.sentiment.sentimentScore;
    if (signal.position === 'LONG' && sentimentScore < -0.3) {
      return 'Bearish sentiment opposes LONG';
    }
    if (signal.position === 'SHORT' && sentimentScore > 0.3) {
      return 'Bullish sentiment opposes SHORT';
    }

    const regime = aiAnalysis.marketRegime.regime;
    if (signal.position === 'LONG' && regime === 'TRENDING_BEAR') {
      return 'Bear market regime opposes LONG';
    }
    if (signal.position === 'SHORT' && regime === 'TRENDING_BULL') {
      return 'Bull market regime opposes SHORT';
    }

    if (aiAnalysis.overallConfidence < 0.3) {
      return 'Low AI confidence';
    }

    const recommendation = aiAnalysis.tradingRecommendation;
    if (signal.position === 'LONG' && (recommendation === 'SELL' || recommendation === 'STRONG_SELL')) {
      return 'AI recommends SELL';
    }
    if (signal.position === 'SHORT' && (recommendation === 'BUY' || recommendation === 'STRONG_BUY')) {
      return 'AI recommends BUY';
    }

    return 'Risk-adjusted confidence too low';
  }
}
