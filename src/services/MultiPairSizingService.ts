import { PositionSizing, LeverageSettings } from '../types';
import { logger } from '../utils/logger';

export interface SizingCalculationResult {
  positionSizing: PositionSizing;
  leverageSettings: LeverageSettings;
  totalExposure: number;
  scalingFactor: number;
  recommendation: string;
}

export class MultiPairSizingService {
  private static instance: MultiPairSizingService;
  
  private readonly MAX_TOTAL_EXPOSURE = 1.00; // 100% maximum total exposure (2 pairs = 100% is safe)
  private readonly MAX_PRIMARY_POSITIONS = 2; // Maximum 2 primary positions across all pairs
  private readonly BASE_ANCHOR_SIZE = parseFloat(process.env.BASE_ANCHOR_SIZE || '0.20');   // 20% base anchor size
  private readonly BASE_HEDGE_SIZE = parseFloat(process.env.BASE_HEDGE_SIZE || '0.30');    // 30% base hedge size
  private readonly BASE_OPPORTUNITY_SIZE = parseFloat(process.env.BASE_OPPORTUNITY_SIZE || '0.20'); // 20% base opportunity size
  private readonly BASE_SCALP_SIZE = parseFloat(process.env.BASE_SCALP_SIZE || '0.10');    // 10% base scalp size
  private readonly BASE_SCALP_HEDGE_SIZE = parseFloat(process.env.BASE_SCALP_HEDGE_SIZE || '0.10'); // 10% base scalp hedge size
  
  // Cross-pair primary position tracking
  private primaryPositionCount: number = 0;
  private primaryPositions: Map<string, { pair: string; type: string; timestamp: number }> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MultiPairSizingService {
    if (!MultiPairSizingService.instance) {
      MultiPairSizingService.instance = new MultiPairSizingService();
    }
    return MultiPairSizingService.instance;
  }

  /**
   * Check if user has set custom position sizing via environment variables
   */
  private hasCustomPositionSizing(): boolean {
    return !!(
      process.env.BASE_ANCHOR_SIZE ||
      process.env.BASE_HEDGE_SIZE ||
      process.env.BASE_OPPORTUNITY_SIZE ||
      process.env.BASE_SCALP_SIZE ||
      process.env.BASE_SCALP_HEDGE_SIZE
    );
  }

  /**
   * Calculate optimal sizing based on number of active pairs
   */
  calculateOptimalSizing(activePairs: string[]): SizingCalculationResult {
    const numPairs = activePairs.length;
    
    logger.info('🎯 Calculating optimal sizing for multi-pair configuration', {
      activePairs: activePairs,
      numPairs: numPairs,
      maxTotalExposure: `${this.MAX_TOTAL_EXPOSURE * 100}%`
    });

    // Check if user has overridden sizing with environment variables
    const hasCustomSizing = this.hasCustomPositionSizing();
    
    let scalingFactor: number;
    let recommendation: string;

    if (hasCustomSizing) {
      // User has set custom sizing - use 1.0 scaling factor (no auto-scaling)
      scalingFactor = 1.0;
      recommendation = `Using custom sizing from environment variables (no auto-scaling)`;
      
      logger.info('🔧 Using custom position sizing from environment', {
        scalingFactor: scalingFactor,
        recommendation: recommendation,
        customSizing: {
          anchor: process.env.BASE_ANCHOR_SIZE || 'not set',
          hedge: process.env.BASE_HEDGE_SIZE || 'not set',
          opportunity: process.env.BASE_OPPORTUNITY_SIZE || 'not set',
          scalp: process.env.BASE_SCALP_SIZE || 'not set'
        }
      });
    } else if (numPairs <= 2) {
      // Use original sizing for 1-2 pairs (exactly 100% for 2 pairs)
      scalingFactor = 1.0;
      recommendation = `Using original sizing (${numPairs} pairs): 20%/30% per pair = ${numPairs * 50}% total exposure`;
      
      logger.info('✅ Using original sizing for 1-2 pairs', {
        scalingFactor: scalingFactor,
        totalExposure: `${numPairs * 50}%`,
        recommendation: recommendation
      });
    } else {
      // Scale down for 3+ pairs to maintain 80% total exposure
      const maxPerPairExposure = 0.80 / numPairs; // 80% total for 3+ pairs
      scalingFactor = maxPerPairExposure / 0.50; // 0.50 = 20% + 30% base exposure
      
      recommendation = `Scaling down for ${numPairs} pairs: ${(maxPerPairExposure * 100).toFixed(1)}% per pair = 80% total exposure`;
      
      logger.warn('⚠️ Scaling down sizing for 3+ pairs', {
        numPairs: numPairs,
        scalingFactor: scalingFactor.toFixed(3),
        maxPerPairExposure: `${(maxPerPairExposure * 100).toFixed(1)}%`,
        totalExposure: "80%",
        recommendation: recommendation
      });
    }

    const positionSizing: PositionSizing = {
      anchorPositionSize: this.BASE_ANCHOR_SIZE * scalingFactor,
      anchorHedgeSize: this.BASE_HEDGE_SIZE * scalingFactor,
      opportunityPositionSize: this.BASE_OPPORTUNITY_SIZE * scalingFactor,
      opportunityHedgeSize: this.BASE_HEDGE_SIZE * scalingFactor, // Same as anchor hedge
      scalpPositionSize: this.BASE_SCALP_SIZE * scalingFactor,
      scalpHedgeSize: this.BASE_SCALP_HEDGE_SIZE * scalingFactor,
      maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.25')
    };

    // Use environment variables for leverage settings (don't override)
    const leverageSettings: LeverageSettings = {
      anchorLeverage: parseInt(process.env.ANCHOR_LEVERAGE || '20'),
      hedgeLeverage: parseInt(process.env.HEDGE_LEVERAGE || '25'),
      opportunityLeverage: parseInt(process.env.OPPORTUNITY_LEVERAGE || '20'),
      scalpLeverage: parseInt(process.env.SCALP_LEVERAGE || '15'),
      scalpHedgeLeverage: parseInt(process.env.SCALP_HEDGE_LEVERAGE || '25'),
      emergencyHedgeLeverage: parseInt(process.env.EMERGENCY_HEDGE_LEVERAGE || '20')
    };

    const totalExposure = this.calculateTotalExposure(positionSizing, numPairs);

    const result: SizingCalculationResult = {
      positionSizing,
      leverageSettings,
      totalExposure,
      scalingFactor,
      recommendation
    };

    logger.info('📊 Multi-pair sizing calculation complete', {
      numPairs: numPairs,
      scalingFactor: scalingFactor.toFixed(3),
      totalExposure: `${(totalExposure * 100).toFixed(1)}%`,
      anchorSize: `${(positionSizing.anchorPositionSize * 100).toFixed(1)}%`,
      hedgeSize: `${(positionSizing.anchorHedgeSize * 100).toFixed(1)}%`,
      opportunitySize: `${(positionSizing.opportunityPositionSize * 100).toFixed(1)}%`,
      scalpSize: `${(positionSizing.scalpPositionSize * 100).toFixed(1)}%`,
      recommendation: recommendation
    });

    return result;
  }

  /**
   * Calculate total exposure for worst-case scenario
   */
  private calculateTotalExposure(positionSizing: PositionSizing, numPairs: number): number {
    // Worst case: all pairs have ANCHOR + HEDGE positions open
    const maxPerPairExposure = positionSizing.anchorPositionSize + positionSizing.anchorHedgeSize;
    const totalExposure = maxPerPairExposure * numPairs;
    
    // Log the calculation for debugging
    logger.debug('🔍 Total exposure calculation', {
      anchorPositionSize: positionSizing.anchorPositionSize,
      anchorHedgeSize: positionSizing.anchorHedgeSize,
      maxPerPairExposure: maxPerPairExposure,
      numPairs: numPairs,
      totalExposure: totalExposure
    });
    
    return totalExposure;
  }

  /**
   * Check if a primary position can be opened (cross-pair limit)
   */
  canOpenPrimaryPosition(pair: string, positionType: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP' | 'HF'): boolean {
    const canOpen = this.primaryPositionCount < this.MAX_PRIMARY_POSITIONS;
    
    if (!canOpen) {
      logger.warn('🚫 Cannot open primary position - global limit reached', {
        pair: pair,
        positionType: positionType,
        currentPrimaryPositions: this.primaryPositionCount,
        maxPrimaryPositions: this.MAX_PRIMARY_POSITIONS,
        activePrimaryPositions: Array.from(this.primaryPositions.values()),
        reason: 'Maximum 2 primary positions allowed across all pairs'
      });
    } else {
      logger.info('✅ Primary position allowed - within global limit', {
        pair: pair,
        positionType: positionType,
        currentPrimaryPositions: this.primaryPositionCount,
        maxPrimaryPositions: this.MAX_PRIMARY_POSITIONS,
        remainingSlots: this.MAX_PRIMARY_POSITIONS - this.primaryPositionCount
      });
    }
    
    return canOpen;
  }

  /**
   * Register a primary position opening
   */
  registerPrimaryPosition(pair: string, positionType: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP' | 'HF', positionId: string): void {
    if (this.primaryPositionCount >= this.MAX_PRIMARY_POSITIONS) {
      logger.error('❌ Attempted to register primary position when limit reached', {
        pair: pair,
        positionType: positionType,
        positionId: positionId,
        currentCount: this.primaryPositionCount,
        maxCount: this.MAX_PRIMARY_POSITIONS
      });
      return;
    }

    this.primaryPositions.set(positionId, {
      pair: pair,
      type: positionType,
      timestamp: Date.now()
    });
    
    this.primaryPositionCount++;
    
    logger.info('📝 Primary position registered', {
      pair: pair,
      positionType: positionType,
      positionId: positionId,
      currentPrimaryPositions: this.primaryPositionCount,
      maxPrimaryPositions: this.MAX_PRIMARY_POSITIONS,
      activePositions: Array.from(this.primaryPositions.values())
    });
  }

  /**
   * Unregister a primary position closing
   */
  unregisterPrimaryPosition(positionId: string): void {
    const position = this.primaryPositions.get(positionId);
    if (!position) {
      logger.warn('⚠️ Attempted to unregister unknown primary position', {
        positionId: positionId,
        currentPositions: Array.from(this.primaryPositions.keys())
      });
      return;
    }

    this.primaryPositions.delete(positionId);
    this.primaryPositionCount--;
    
    logger.info('🗑️ Primary position unregistered', {
      pair: position.pair,
      positionType: position.type,
      positionId: positionId,
      currentPrimaryPositions: this.primaryPositionCount,
      maxPrimaryPositions: this.MAX_PRIMARY_POSITIONS,
      remainingSlots: this.MAX_PRIMARY_POSITIONS - this.primaryPositionCount
    });
  }

  /**
   * Get current primary position status
   */
  getPrimaryPositionStatus(): {
    currentCount: number;
    maxCount: number;
    remainingSlots: number;
    activePositions: Array<{ pair: string; type: string; timestamp: number }>;
  } {
    return {
      currentCount: this.primaryPositionCount,
      maxCount: this.MAX_PRIMARY_POSITIONS,
      remainingSlots: this.MAX_PRIMARY_POSITIONS - this.primaryPositionCount,
      activePositions: Array.from(this.primaryPositions.values())
    };
  }

  /**
   * Get sizing recommendations for different pair counts
   */
  getSizingRecommendations(): Record<number, string> {
    return {
      1: "20%/30% per pair = 50% total (single pair - optimal)",
      2: "20%/30% per pair = 100% total (2 pairs - maximum safe)",
      3: "13.3%/20% per pair = 100% total (3 pairs - scaled down)",
      4: "10%/15% per pair = 100% total (4 pairs - scaled down)",
      5: "8%/12% per pair = 100% total (5 pairs - scaled down)"
    };
  }

  /**
   * Validate if current configuration is safe
   */
  validateConfiguration(activePairs: string[], currentSizing: PositionSizing): {
    isSafe: boolean;
    totalExposure: number;
    maxSafe: number;
    recommendation: string;
  } {
    const numPairs = activePairs.length;
    const totalExposure = this.calculateTotalExposure(currentSizing, numPairs);
    // For 1-2 pairs: 100% is safe, for 3+ pairs: 80% is safe
    const maxSafe = numPairs <= 2 ? 1.00 : 0.80;
    
    const isSafe = totalExposure <= maxSafe;
    
    let recommendation: string;
    if (isSafe) {
      recommendation = `Configuration is safe: ${(totalExposure * 100).toFixed(1)}% ≤ ${(maxSafe * 100)}%`;
    } else {
      recommendation = `Configuration is UNSAFE: ${(totalExposure * 100).toFixed(1)}% > ${(maxSafe * 100)}%. Consider reducing position sizes.`;
    }

    return {
      isSafe,
      totalExposure,
      maxSafe,
      recommendation
    };
  }

  /**
   * Get detailed sizing breakdown for logging
   */
  getDetailedBreakdown(activePairs: string[], sizing: PositionSizing): string {
    const numPairs = activePairs.length;
    const perPairExposure = sizing.anchorPositionSize + sizing.anchorHedgeSize;
    const totalExposure = perPairExposure * numPairs;
    const maxSafe = numPairs <= 2 ? 1.00 : 0.80;
    
    return `
📊 Multi-Pair Sizing Breakdown:
├── Active Pairs: ${activePairs.join(', ')} (${numPairs} total)
├── Per-Pair Exposure: ${(perPairExposure * 100).toFixed(1)}%
│   ├── Anchor Position: ${(sizing.anchorPositionSize * 100).toFixed(1)}%
│   ├── Anchor Hedge: ${(sizing.anchorHedgeSize * 100).toFixed(1)}%
│   ├── Opportunity Position: ${(sizing.opportunityPositionSize * 100).toFixed(1)}%
│   ├── Opportunity Hedge: ${(sizing.opportunityHedgeSize * 100).toFixed(1)}%
│   ├── Scalp Position: ${(sizing.scalpPositionSize * 100).toFixed(1)}%
│   └── Scalp Hedge: ${(sizing.scalpHedgeSize * 100).toFixed(1)}%
├── Total Exposure: ${(totalExposure * 100).toFixed(1)}%
├── Max Safe Exposure: ${(maxSafe * 100)}%
└── Safety Status: ${totalExposure <= maxSafe ? '✅ SAFE' : '⚠️ UNSAFE'}
    `.trim();
  }
}
