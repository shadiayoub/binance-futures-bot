import { MarketData } from '../types';
import { logger } from '../utils/logger';

export interface VolumeAnalysisResult {
  isHighVolume: boolean;
  volumeRatio: number;
  volumeMultiplier: number;
  shouldActivateScalp: boolean;
  scalpParameters: ScalpParameters | null;
  volumePersistence: VolumePersistence;
}

export interface ScalpParameters {
  tpPercent: number;
  leverage: number;
  hedgeLeverage: number;
  volumeThreshold: number;
}

export interface VolumePersistence {
  isPersistent: boolean;
  durationMinutes: number;
  fallbackThreshold: number;
  lastHighVolumeTime: Date | null;
}

export class VolumeAnalysis {
  private volumeHistory: Map<string, number[]> = new Map();
  private highVolumeStartTime: Map<string, Date | null> = new Map();
  private readonly maxHistoryLength = 100;

  constructor() {
    logger.info('📊 Volume Analysis Service Initialized');
  }

  /**
   * Analyze volume conditions for scalp activation
   */
  analyzeVolumeForScalp(
    symbol: string,
    currentVolume: number,
    marketData: MarketData[]
  ): VolumeAnalysisResult {
    try {
      // Update volume history
      this.updateVolumeHistory(symbol, currentVolume);

      // Calculate volume ratios across multiple timeframes
      const volumeRatios = this.calculateVolumeRatios(symbol, marketData);

      // Determine if volume is high enough for scalp
      const minVolumeMultiplier = parseFloat(process.env.SCALP_MIN_VOLUME_MULTIPLIER || '2.0');
      const isHighVolume = volumeRatios.current >= minVolumeMultiplier;

      // Check volume persistence
      const volumePersistence = this.checkVolumePersistence(symbol, isHighVolume);

      // Determine scalp parameters based on volume
      const scalpParameters = this.getScalpParameters(volumeRatios.current, isHighVolume);

      // Final scalp activation decision
      const shouldActivateScalp = this.shouldActivateScalp(
        isHighVolume,
        volumePersistence,
        scalpParameters
      );

      const result: VolumeAnalysisResult = {
        isHighVolume,
        volumeRatio: volumeRatios.current,
        volumeMultiplier: minVolumeMultiplier,
        shouldActivateScalp,
        scalpParameters,
        volumePersistence
      };

      logger.info('📊 Volume Analysis Complete', {
        symbol,
        currentVolume,
        volumeRatio: volumeRatios.current.toFixed(2),
        isHighVolume,
        shouldActivateScalp,
        scalpParameters: scalpParameters ? {
          tpPercent: scalpParameters.tpPercent,
          leverage: scalpParameters.leverage,
          hedgeLeverage: scalpParameters.hedgeLeverage
        } : null,
        volumePersistence: {
          isPersistent: volumePersistence.isPersistent,
          durationMinutes: volumePersistence.durationMinutes
        }
      });

      return result;
    } catch (error) {
      logger.error('❌ Volume analysis failed', { symbol, error });
      return this.getDefaultResult();
    }
  }

  /**
   * Update volume history for a symbol
   */
  private updateVolumeHistory(symbol: string, currentVolume: number): void {
    if (!this.volumeHistory.has(symbol)) {
      this.volumeHistory.set(symbol, []);
    }

    const history = this.volumeHistory.get(symbol)!;
    history.push(currentVolume);

    // Keep only recent history
    if (history.length > this.maxHistoryLength) {
      history.shift();
    }
  }

  /**
   * Calculate volume ratios across multiple timeframes
   */
  private calculateVolumeRatios(symbol: string, marketData: MarketData[]): {
    current: number;
    average1m: number;
    average5m: number;
    average15m: number;
  } {
    const history = this.volumeHistory.get(symbol) || [];
    const currentVolume = history[history.length - 1] || 0;

    // Calculate averages for different timeframes
    const average1m = this.calculateAverage(history, 1);
    const average5m = this.calculateAverage(history, 5);
    const average15m = this.calculateAverage(history, 15);

    // Use market data for longer-term averages if available
    const marketDataAverage = this.calculateMarketDataAverage(marketData);

    // Current volume ratio (primary metric)
    const current = average1m > 0 ? currentVolume / average1m : 0;

    return {
      current,
      average1m,
      average5m,
      average15m
    };
  }

  /**
   * Calculate average volume for a given period
   */
  private calculateAverage(history: number[], period: number): number {
    if (history.length < period) {
      return history.length > 0 ? history.reduce((a, b) => a + b, 0) / history.length : 0;
    }

    const recent = history.slice(-period);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  /**
   * Calculate average volume from market data
   */
  private calculateMarketDataAverage(marketData: MarketData[]): number {
    if (marketData.length === 0) return 0;

    const totalVolume = marketData.reduce((sum, data) => sum + data.volume, 0);
    return totalVolume / marketData.length;
  }

  /**
   * Check volume persistence over time
   */
  private checkVolumePersistence(symbol: string, isHighVolume: boolean): VolumePersistence {
    const persistenceMinutes = parseInt(process.env.SCALP_VOLUME_PERSISTENCE_MINUTES || '5');
    const fallbackThreshold = parseFloat(process.env.SCALP_VOLUME_FALLBACK_THRESHOLD || '1.5');

    const now = new Date();
    const lastHighVolumeTime = this.highVolumeStartTime.get(symbol);

    if (isHighVolume) {
      if (!lastHighVolumeTime) {
        // Start tracking high volume period
        this.highVolumeStartTime.set(symbol, now);
        return {
          isPersistent: false,
          durationMinutes: 0,
          fallbackThreshold,
          lastHighVolumeTime: now
        };
      } else {
        // Continue tracking high volume period
        const durationMs = now.getTime() - lastHighVolumeTime.getTime();
        const durationMinutes = durationMs / (1000 * 60);
        const isPersistent = durationMinutes >= persistenceMinutes;

        return {
          isPersistent,
          durationMinutes,
          fallbackThreshold,
          lastHighVolumeTime
        };
      }
    } else {
      // Reset high volume tracking
      this.highVolumeStartTime.set(symbol, null);
      return {
        isPersistent: false,
        durationMinutes: 0,
        fallbackThreshold,
        lastHighVolumeTime: null
      };
    }
  }

  /**
   * Get scalp parameters based on volume conditions
   */
  private getScalpParameters(volumeRatio: number, isHighVolume: boolean): ScalpParameters | null {
    if (!isHighVolume) {
      return null;
    }

    // Dynamic parameters based on volume intensity
    if (volumeRatio >= 3.0) {
      // Extreme volume - more aggressive parameters
      return {
        tpPercent: parseFloat(process.env.SCALP_HIGH_VOLUME_TP_PERCENT || '1.0') * 1.5,
        leverage: parseInt(process.env.SCALP_HIGH_VOLUME_LEVERAGE || '12') + 3,
        hedgeLeverage: parseInt(process.env.SCALP_HIGH_VOLUME_HEDGE_LEVERAGE || '20') + 5,
        volumeThreshold: 3.0
      };
    } else if (volumeRatio >= 2.0) {
      // Standard high volume - normal parameters
      return {
        tpPercent: parseFloat(process.env.SCALP_HIGH_VOLUME_TP_PERCENT || '1.0'),
        leverage: parseInt(process.env.SCALP_HIGH_VOLUME_LEVERAGE || '12'),
        hedgeLeverage: parseInt(process.env.SCALP_HIGH_VOLUME_HEDGE_LEVERAGE || '20'),
        volumeThreshold: 2.0
      };
    } else if (volumeRatio >= 1.5) {
      // Moderate volume - conservative parameters
      return {
        tpPercent: parseFloat(process.env.SCALP_HIGH_VOLUME_TP_PERCENT || '1.0') * 0.8,
        leverage: parseInt(process.env.SCALP_HIGH_VOLUME_LEVERAGE || '12') - 2,
        hedgeLeverage: parseInt(process.env.SCALP_HIGH_VOLUME_HEDGE_LEVERAGE || '20') - 3,
        volumeThreshold: 1.5
      };
    }

    return null;
  }

  /**
   * Determine if scalp should be activated
   */
  private shouldActivateScalp(
    isHighVolume: boolean,
    volumePersistence: VolumePersistence,
    scalpParameters: ScalpParameters | null
  ): boolean {
    // Check if scalp is enabled
    const scalpEnabled = process.env.SCALP_ENABLED === 'true';
    if (!scalpEnabled) {
      return false;
    }

    // Must have high volume
    if (!isHighVolume) {
      return false;
    }

    // Must have scalp parameters
    if (!scalpParameters) {
      return false;
    }

    // Check volume persistence (optional - can be disabled for immediate activation)
    const requirePersistence = process.env.SCALP_REQUIRE_PERSISTENCE !== 'false';
    if (requirePersistence && !volumePersistence.isPersistent) {
      return false;
    }

    return true;
  }

  /**
   * Get default result when analysis fails
   */
  private getDefaultResult(): VolumeAnalysisResult {
    return {
      isHighVolume: false,
      volumeRatio: 0,
      volumeMultiplier: 2.0,
      shouldActivateScalp: false,
      scalpParameters: null,
      volumePersistence: {
        isPersistent: false,
        durationMinutes: 0,
        fallbackThreshold: 1.5,
        lastHighVolumeTime: null
      }
    };
  }

  /**
   * Get current volume status for a symbol
   */
  getVolumeStatus(symbol: string): {
    currentVolume: number;
    averageVolume: number;
    volumeRatio: number;
    isHighVolume: boolean;
    highVolumeDuration: number;
  } {
    const history = this.volumeHistory.get(symbol) || [];
    const currentVolume = history[history.length - 1] || 0;
    const averageVolume = this.calculateAverage(history, 10);
    const volumeRatio = averageVolume > 0 ? currentVolume / averageVolume : 0;
    const isHighVolume = volumeRatio >= parseFloat(process.env.SCALP_MIN_VOLUME_MULTIPLIER || '2.0');
    
    const lastHighVolumeTime = this.highVolumeStartTime.get(symbol);
    const highVolumeDuration = lastHighVolumeTime 
      ? (Date.now() - lastHighVolumeTime.getTime()) / (1000 * 60)
      : 0;

    return {
      currentVolume,
      averageVolume,
      volumeRatio,
      isHighVolume,
      highVolumeDuration
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.volumeHistory.clear();
    this.highVolumeStartTime.clear();
    logger.info('📊 Volume Analysis Service Cleaned Up');
  }
}
