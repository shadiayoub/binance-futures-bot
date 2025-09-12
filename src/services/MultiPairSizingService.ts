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
  private readonly MAX_TOTAL_EXPOSURE = 1.00; // 100% maximum total exposure (2 pairs = 100% is safe)
  private readonly BASE_ANCHOR_SIZE = parseFloat(process.env.BASE_ANCHOR_SIZE || '0.20');   // 20% base anchor size
  private readonly BASE_HEDGE_SIZE = parseFloat(process.env.BASE_HEDGE_SIZE || '0.30');    // 30% base hedge size
  private readonly BASE_OPPORTUNITY_SIZE = parseFloat(process.env.BASE_OPPORTUNITY_SIZE || '0.20'); // 20% base opportunity size
  private readonly BASE_SCALP_SIZE = parseFloat(process.env.BASE_SCALP_SIZE || '0.10');    // 10% base scalp size
  private readonly BASE_SCALP_HEDGE_SIZE = parseFloat(process.env.BASE_SCALP_HEDGE_SIZE || '0.10'); // 10% base scalp hedge size

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

    let scalingFactor: number;
    let recommendation: string;

    if (numPairs <= 2) {
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
      scalpHedgeSize: this.BASE_SCALP_HEDGE_SIZE * scalingFactor
    };

    // Use environment variables for leverage settings (don't override)
    const leverageSettings: LeverageSettings = {
      anchorLeverage: parseInt(process.env.ANCHOR_LEVERAGE || '10'),
      hedgeLeverage: parseInt(process.env.HEDGE_LEVERAGE || '15'),
      opportunityLeverage: parseInt(process.env.OPPORTUNITY_LEVERAGE || '10'),
      scalpLeverage: parseInt(process.env.SCALP_LEVERAGE || '15'),
      scalpHedgeLeverage: parseInt(process.env.SCALP_HEDGE_LEVERAGE || '15'),
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
    return maxPerPairExposure * numPairs;
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
