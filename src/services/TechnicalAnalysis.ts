import { 
  MarketData, 
  TechnicalIndicators, 
  TechnicalConfig 
} from '../types';
import { 
  RSI, 
  EMA, 
  SMA,
  StochasticRSI,
  BollingerBands,
  ATR,
  MFI,
  MACD,
  AwesomeOscillator,
  TRIX,
  PSAR
} from 'technicalindicators';
import { logger } from '../utils/logger';

export class TechnicalAnalysis {
  private config: TechnicalConfig;

  constructor(config: TechnicalConfig) {
    this.config = config;
  }

  /**
   * Calculate RSI indicator
   */
  calculateRSI(prices: number[]): number {
    try {
      const rsi = RSI.calculate({
        values: prices,
        period: this.config.rsiPeriod
      });
      return rsi[rsi.length - 1] || 50;
    } catch (error) {
      logger.error('Failed to calculate RSI', error);
      return 50;
    }
  }

  /**
   * Calculate EMA indicators
   */
  calculateEMA(prices: number[], period: number): number {
    try {
      const ema = EMA.calculate({
        values: prices,
        period: period
      });
      const lastEma = ema[ema.length - 1];
      const lastPrice = prices[prices.length - 1];
      return lastEma ?? lastPrice ?? 0;
    } catch (error) {
      logger.error('Failed to calculate EMA', error);
      const lastPrice = prices[prices.length - 1];
      return lastPrice ?? 0;
    }
  }

  /**
   * Calculate SMA for volume
   */
  calculateVolumeSMA(volumes: number[]): number {
    try {
      logger.info('🔍 Volume SMA Calculation Debug', {
        volumesLength: volumes.length,
        volumePeriod: this.config.volumePeriod,
        lastFewVolumes: volumes.slice(-5).map(v => v.toFixed(2)),
        allVolumesValid: volumes.every(v => !isNaN(v) && v > 0)
      });
      
      const sma = SMA.calculate({
        values: volumes,
        period: this.config.volumePeriod
      });
      
      logger.info('🔍 Volume SMA Result', {
        smaLength: sma.length,
        lastSma: sma[sma.length - 1]?.toFixed(2),
        lastVolume: volumes[volumes.length - 1]?.toFixed(2)
      });
      
      const lastSma = sma[sma.length - 1];
      const lastVolume = volumes[volumes.length - 1];
      return lastSma ?? lastVolume ?? 0;
    } catch (error) {
      logger.error('Failed to calculate Volume SMA', error);
      const lastVolume = volumes[volumes.length - 1];
      return lastVolume ?? 0;
    }
  }

  /**
   * Determine trend direction based on EMAs
   */
  determineTrend(emaFast: number, emaSlow: number): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    const diff = Math.abs(emaFast - emaSlow) / emaSlow;
    
    if (diff < 0.01) {
      return 'SIDEWAYS';
    }
    
    return emaFast > emaSlow ? 'BULLISH' : 'BEARISH';
  }

  /**
   * Calculate volume ratio
   */
  calculateVolumeRatio(currentVolume: number, averageVolume: number): number {
    return currentVolume / averageVolume;
  }

  /**
   * Calculate VWAP (Volume Weighted Average Price)
   */
  calculateVWAP(marketData: MarketData[]): number {
    if (marketData.length === 0) {
      return 0;
    }

    let totalVolumePrice = 0;
    let totalVolume = 0;

    for (const data of marketData) {
      totalVolumePrice += data.price * data.volume;
      totalVolume += data.volume;
    }

    return totalVolume > 0 ? totalVolumePrice / totalVolume : 0;
  }

  /**
   * Calculate VWAP distance (how far current price is from VWAP)
   */
  calculateVWAPDistance(currentPrice: number, vwap: number): number {
    if (vwap === 0) return 0;
    return ((currentPrice - vwap) / vwap) * 100; // Return as percentage
  }

  /**
   * Get comprehensive technical indicators
   */
  getTechnicalIndicators(marketData: MarketData[]): TechnicalIndicators {
    if (marketData.length < Math.max(this.config.rsiPeriod, this.config.emaSlow)) {
      throw new Error('Insufficient market data for technical analysis');
    }

    const prices = marketData.map(data => data.price);
    const volumes = marketData.map(data => data.volume);

    const rsi = this.calculateRSI(prices);
    const emaFast = this.calculateEMA(prices, this.config.emaFast);
    const emaSlow = this.calculateEMA(prices, this.config.emaSlow);
    const volumeSma = this.calculateVolumeSMA(volumes);
    const lastVolume = volumes[volumes.length - 1] ?? 0;
    const volumeRatio = this.calculateVolumeRatio(lastVolume, volumeSma);
    
    // Calculate VWAP and distance
    const vwap = this.calculateVWAP(marketData);
    const currentPrice = prices[prices.length - 1] ?? 0;
    const vwapDistance = this.calculateVWAPDistance(currentPrice, vwap);
    
    // Debug logging for volume and VWAP analysis
    logger.info('🔍 Volume & VWAP Calculation Debug', {
      lastVolume: lastVolume.toFixed(2),
      volumeSma: volumeSma.toFixed(2),
      volumeRatio: volumeRatio.toFixed(2),
      vwap: vwap.toFixed(4),
      currentPrice: currentPrice.toFixed(4),
      vwapDistance: vwapDistance.toFixed(2) + '%',
      volumesLength: volumes.length,
      lastFewVolumes: volumes.slice(-3).map(v => v.toFixed(2))
    });
    
    const trend = this.determineTrend(emaFast, emaSlow);

    // Calculate high-frequency trading indicators
    const stochasticRSI = this.calculateStochasticRSI(prices);
    const bollingerBands = this.calculateBollingerBands(prices);
    const atr = this.calculateATR(marketData);
    const mfi = this.calculateMFI(marketData);
    const macd = this.calculateMACD(prices);
    const awesomeOscillator = this.calculateAwesomeOscillator(marketData);
    const trix = this.calculateTRIX(prices);
    const psar = this.calculatePSAR(marketData);

    // Debug logging for high-frequency indicators
    logger.info('🔍 High-Frequency Indicators Debug', {
      stochasticRSI: {
        k: stochasticRSI.k.toFixed(2),
        d: stochasticRSI.d.toFixed(2),
        isOversold: stochasticRSI.isOversold,
        isOverbought: stochasticRSI.isOverbought
      },
      bollingerBands: {
        upper: bollingerBands.upper.toFixed(4),
        middle: bollingerBands.middle.toFixed(4),
        lower: bollingerBands.lower.toFixed(4),
        bandwidth: bollingerBands.bandwidth.toFixed(2) + '%',
        isUpperTouch: bollingerBands.isUpperTouch,
        isLowerTouch: bollingerBands.isLowerTouch
      },
      atr: atr.toFixed(4),
      mfi: mfi.toFixed(2),
      macd: {
        macd: macd.macd.toFixed(4),
        signal: macd.signal.toFixed(4),
        histogram: macd.histogram.toFixed(4),
        isBullish: macd.isBullish,
        isBearish: macd.isBearish
      },
      awesomeOscillator: awesomeOscillator.toFixed(4),
      trix: trix.toFixed(4),
      psar: psar.toFixed(4)
    });

    return {
      rsi,
      emaFast,
      emaSlow,
      volumeSma,
      volumeRatio,
      trend,
      vwap,
      vwapDistance,
      
      // High-Frequency Trading Indicators
      stochasticRSI,
      bollingerBands,
      atr,
      mfi,
      macd,
      awesomeOscillator,
      trix,
      psar
    };
  }

  /**
   * Check if volume is above threshold
   */
  isVolumeAboveThreshold(volumeRatio: number): boolean {
    const result = volumeRatio >= this.config.volumeMultiplier;
    logger.info('🔍 Volume Threshold Check', {
      volumeRatio: volumeRatio.toFixed(2),
      volumeMultiplier: this.config.volumeMultiplier,
      result
    });
    return result;
  }

  /**
   * Get the volume multiplier threshold
   */
  getVolumeMultiplier(): number {
    return this.config.volumeMultiplier;
  }

  /**
   * Check if RSI is in valid range for trading
   * Expanded range for hedged strategy - more opportunities
   */
  isRSIInValidRange(rsi: number): boolean {
    return rsi >= 25 && rsi <= 75; // Expanded from 30-70 to 25-75 for more opportunities
  }

  /**
   * Detect support/resistance levels from price action
   */
  detectSupportResistanceLevels(marketData: MarketData[]): { support: number[]; resistance: number[] } {
    const prices = marketData.map(data => data.price);
    const highs: number[] = [];
    const lows: number[] = [];

    // Simple pivot point detection
    for (let i = 2; i < prices.length - 2; i++) {
      const current = prices[i];
      const prev1 = prices[i-1];
      const prev2 = prices[i-2];
      const next1 = prices[i+1];
      const next2 = prices[i+2];
      
      if (current && prev1 && prev2 && next1 && next2) {
        // Check for local high
        if (current > prev1 && current > prev2 && 
            current > next1 && current > next2) {
          highs.push(current);
        }
        
        // Check for local low
        if (current < prev1 && current < prev2 && 
            current < next1 && current < next2) {
          lows.push(current);
        }
      }
    }

    // Sort and get significant levels
    const resistance = highs
      .sort((a, b) => b - a)
      .slice(0, 5)
      .filter((level, index, arr) => {
        const prevLevel = arr[index - 1];
        return index === 0 || (prevLevel && Math.abs(level - prevLevel) / level > 0.01);
      });

    const support = lows
      .sort((a, b) => a - b)
      .slice(0, 5)
      .filter((level, index, arr) => {
        const prevLevel = arr[index - 1];
        return index === 0 || (prevLevel && Math.abs(level - prevLevel) / level > 0.01);
      });

    return { support, resistance };
  }

  /**
   * Check if price is near a support/resistance level
   */
  isNearLevel(price: number, levels: number[], threshold: number = 0.005): boolean {
    return levels.some(level => Math.abs(price - level) / level <= threshold);
  }

  /**
   * Get the nearest support/resistance level
   */
  getNearestLevel(price: number, levels: number[]): { level: number; distance: number } | null {
    if (levels.length === 0) return null;

    const firstLevel = levels[0];
    if (!firstLevel) return null;

    let nearest = firstLevel;
    let minDistance = Math.abs(price - nearest) / price;

    for (const level of levels) {
      if (level) {
        const distance = Math.abs(price - level) / price;
        if (distance < minDistance) {
          minDistance = distance;
          nearest = level;
        }
      }
    }

    return { level: nearest, distance: minDistance };
  }

  // ============================================================================
  // HIGH-FREQUENCY TRADING INDICATORS (0.6% Profit Targets)
  // ============================================================================

  /**
   * Calculate Stochastic RSI - Ultra-sensitive momentum indicator
   */
  calculateStochasticRSI(prices: number[]): { k: number; d: number; isOversold: boolean; isOverbought: boolean } {
    try {
      const config = this.config.stochasticRSI;
      const result = StochasticRSI.calculate({
        values: prices,
        rsiPeriod: config.rsiPeriod,
        stochasticPeriod: config.stochasticPeriod,
        kPeriod: config.kPeriod,
        dPeriod: config.dPeriod
      });

      const lastResult = result[result.length - 1];
      if (!lastResult) {
        return { k: 50, d: 50, isOversold: false, isOverbought: false };
      }

      return {
        k: lastResult.k,
        d: lastResult.d,
        isOversold: lastResult.k < 20,
        isOverbought: lastResult.k > 80
      };
    } catch (error) {
      logger.error('Failed to calculate Stochastic RSI', error);
      return { k: 50, d: 50, isOversold: false, isOverbought: false };
    }
  }

  /**
   * Calculate Bollinger Bands - Volatility-based entries
   */
  calculateBollingerBands(prices: number[]): { upper: number; middle: number; lower: number; bandwidth: number; isUpperTouch: boolean; isLowerTouch: boolean } {
    try {
      const config = this.config.bollingerBands;
      const result = BollingerBands.calculate({
        values: prices,
        period: config.period,
        stdDev: config.stdDev
      });

      const lastResult = result[result.length - 1];
      const currentPrice = prices[prices.length - 1];
      
      if (!lastResult || !currentPrice) {
        return { 
          upper: currentPrice || 0, 
          middle: currentPrice || 0, 
          lower: currentPrice || 0, 
          bandwidth: 0, 
          isUpperTouch: false, 
          isLowerTouch: false 
        };
      }

      const bandwidth = ((lastResult.upper - lastResult.lower) / lastResult.middle) * 100;
      const tolerance = 0.002; // 0.2% tolerance for touch detection

      return {
        upper: lastResult.upper,
        middle: lastResult.middle,
        lower: lastResult.lower,
        bandwidth,
        isUpperTouch: Math.abs(currentPrice - lastResult.upper) / lastResult.upper <= tolerance,
        isLowerTouch: Math.abs(currentPrice - lastResult.lower) / lastResult.lower <= tolerance
      };
    } catch (error) {
      logger.error('Failed to calculate Bollinger Bands', error);
      const currentPrice = prices[prices.length - 1] || 0;
      return { 
        upper: currentPrice, 
        middle: currentPrice, 
        lower: currentPrice, 
        bandwidth: 0, 
        isUpperTouch: false, 
        isLowerTouch: false 
      };
    }
  }

  /**
   * Calculate ATR (Average True Range) - Dynamic stop-losses
   */
  calculateATR(marketData: MarketData[]): number {
    try {
      const config = this.config.atr;
      
      // Convert MarketData to OHLC format for ATR
      const input = marketData.map(data => ({
        high: data.price * 1.001, // Approximate high from price
        low: data.price * 0.999,   // Approximate low from price
        close: data.price
      }));

      const result = ATR.calculate({
        high: input.map(c => c.high),
        low: input.map(c => c.low),
        close: input.map(c => c.close),
        period: config.period
      });

      return result[result.length - 1] || 0;
    } catch (error) {
      logger.error('Failed to calculate ATR', error);
      return 0;
    }
  }

  /**
   * Calculate MFI (Money Flow Index) - Volume-weighted momentum
   */
  calculateMFI(marketData: MarketData[]): number {
    try {
      const config = this.config.mfi;
      
      // Convert MarketData to OHLC format for MFI
      const input = marketData.map(data => ({
        high: data.price * 1.001,
        low: data.price * 0.999,
        close: data.price,
        volume: data.volume
      }));

      const result = MFI.calculate({
        high: input.map(c => c.high),
        low: input.map(c => c.low),
        close: input.map(c => c.close),
        volume: input.map(c => c.volume),
        period: config.period
      });

      return result[result.length - 1] || 50;
    } catch (error) {
      logger.error('Failed to calculate MFI', error);
      return 50;
    }
  }

  /**
   * Calculate MACD - Trend confirmation
   */
  calculateMACD(prices: number[]): { macd: number; signal: number; histogram: number; isBullish: boolean; isBearish: boolean } {
    try {
      const config = this.config.macd;
      const result = MACD.calculate({
        values: prices,
        fastPeriod: config.fastPeriod,
        slowPeriod: config.slowPeriod,
        signalPeriod: config.signalPeriod,
        SimpleMAOscillator: SMA as any,
        SimpleMASignal: SMA as any
      });

      const lastResult = result[result.length - 1];
      if (!lastResult || lastResult.MACD === undefined || lastResult.signal === undefined || lastResult.histogram === undefined) {
        return { macd: 0, signal: 0, histogram: 0, isBullish: false, isBearish: false };
      }

      return {
        macd: lastResult.MACD,
        signal: lastResult.signal,
        histogram: lastResult.histogram,
        isBullish: lastResult.MACD > lastResult.signal,
        isBearish: lastResult.MACD < lastResult.signal
      };
    } catch (error) {
      logger.error('Failed to calculate MACD', error);
      return { macd: 0, signal: 0, histogram: 0, isBullish: false, isBearish: false };
    }
  }

  /**
   * Calculate Awesome Oscillator - Zero line crossovers
   */
  calculateAwesomeOscillator(marketData: MarketData[]): number {
    try {
      const config = this.config.awesomeOscillator;
      
      // Convert MarketData to OHLC format
      const input = marketData.map(data => ({
        high: data.price * 1.001,
        low: data.price * 0.999,
        close: data.price
      }));

      const result = AwesomeOscillator.calculate({
        high: input.map(c => c.high),
        low: input.map(c => c.low),
        fastPeriod: config.fastPeriod,
        slowPeriod: config.slowPeriod
      });

      return result[result.length - 1] || 0;
    } catch (error) {
      logger.error('Failed to calculate Awesome Oscillator', error);
      return 0;
    }
  }

  /**
   * Calculate TRIX - Triple smoothed EMA
   */
  calculateTRIX(prices: number[]): number {
    try {
      const config = this.config.trix;
      const result = TRIX.calculate({
        values: prices,
        period: config.period
      });

      return result[result.length - 1] || 0;
    } catch (error) {
      logger.error('Failed to calculate TRIX', error);
      return 0;
    }
  }

  /**
   * Calculate PSAR (Parabolic SAR) - Trend reversal points
   */
  calculatePSAR(marketData: MarketData[]): number {
    try {
      const config = this.config.psar;
      
      // Convert MarketData to OHLC format
      const input = marketData.map(data => ({
        high: data.price * 1.001,
        low: data.price * 0.999,
        close: data.price
      }));

      const result = PSAR.calculate({
        high: input.map(c => c.high),
        low: input.map(c => c.low),
        step: config.step,
        max: config.maximum
      });

      return result[result.length - 1] || 0;
    } catch (error) {
      logger.error('Failed to calculate PSAR', error);
      return 0;
    }
  }
}
