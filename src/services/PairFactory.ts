/**
 * Pair Factory
 * Creates pair-specific services and configurations
 */

import { PairConfig } from '../config/PairConfig';
import { BinanceService } from './BinanceService';
import { TechnicalAnalysis } from './TechnicalAnalysis';
import { PositionManager } from './PositionManager';
import { HedgeStrategy } from '../strategies/HedgeStrategy';
import { ScalpStrategy } from '../strategies/ScalpStrategy';
import { DynamicLevels } from './DynamicLevels';
import { ComprehensiveLevels } from './ComprehensiveLevels';
import { PairLoader } from './PairLoader';
import { MultiPairSizingService } from './MultiPairSizingService';
import { logger } from '../utils/logger';

export interface PairServices {
  binanceService: BinanceService;
  technicalAnalysis: TechnicalAnalysis;
  positionManager: PositionManager;
  hedgeStrategy: HedgeStrategy;
  scalpStrategy: ScalpStrategy;
  dynamicLevels: DynamicLevels;
  comprehensiveLevels: ComprehensiveLevels;
}

export class PairFactory {
  private static sizingService = MultiPairSizingService.getInstance();

  /**
   * Create all services for a specific pair with automatic sizing
   */
  static async createPairServices(config: PairConfig, activePairs: string[]): Promise<PairServices> {
    try {
      logger.info(`Creating services for pair: ${config.symbol}`, {
        symbol: config.symbol,
        name: config.name,
        baseBalance: config.baseBalance,
        activePairs: activePairs
      });

      // Calculate optimal sizing based on number of active pairs
      const sizingResult = this.sizingService.calculateOptimalSizing(activePairs);
      
      // Override config sizing with calculated optimal sizing, but keep pair-specific leverage from config
      const optimizedConfig = {
        ...config,
        positionSizing: sizingResult.positionSizing,
        leverageSettings: config.leverageSettings // Use pair-specific leverage from config, not global
      };

      logger.info(`Applied automatic sizing for ${config.symbol}`, {
        symbol: config.symbol,
        originalSizing: {
          anchor: `${(config.positionSizing.anchorPositionSize * 100).toFixed(1)}%`,
          hedge: `${(config.positionSizing.anchorHedgeSize * 100).toFixed(1)}%`
        },
        optimizedSizing: {
          anchor: `${(sizingResult.positionSizing.anchorPositionSize * 100).toFixed(1)}%`,
          hedge: `${(sizingResult.positionSizing.anchorHedgeSize * 100).toFixed(1)}%`
        },
        scalingFactor: sizingResult.scalingFactor.toFixed(3),
        totalExposure: `${(sizingResult.totalExposure * 100).toFixed(1)}%`,
        recommendation: sizingResult.recommendation
      });

      // Log detailed breakdown
      logger.info(this.sizingService.getDetailedBreakdown(activePairs, sizingResult.positionSizing));
      
      // Create Binance service with pair-specific configuration
      const binanceService = new BinanceService({
        apiKey: process.env.BINANCE_API_KEY || '',
        secretKey: process.env.BINANCE_SECRET_KEY || '',
        testnet: process.env.BINANCE_TESTNET === 'true',
        tradingPair: config.symbol,
        baseBalance: config.baseBalance,
        riskPerTrade: 0,
        historical4hDays: parseInt(process.env.HISTORICAL_4H_DAYS || '180'),
        historical1hDays: parseInt(process.env.HISTORICAL_1H_DAYS || '7'),
        historical15mDays: parseInt(process.env.HISTORICAL_15M_DAYS || '1'),
        priceUpdateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '20'),
      });
      
      // Create technical analysis service
      const technicalAnalysis = new TechnicalAnalysis(config.technicalConfig);
      
      // Create position manager with optimized sizing
      const positionManager = new PositionManager(
        binanceService,
        technicalAnalysis,
        optimizedConfig.positionSizing,
        optimizedConfig.leverageSettings
      );
      
      // Create dynamic levels service
      const dynamicLevels = new DynamicLevels();
      
      // Load comprehensive levels
      const comprehensiveLevels = await this.createComprehensiveLevels(config);
      
      // Create hedge strategy with optimized sizing
      const hedgeStrategy = new HedgeStrategy(
        binanceService,
        technicalAnalysis,
        config.supportResistanceLevels,
        optimizedConfig.positionSizing,
        optimizedConfig.leverageSettings,
        dynamicLevels
      );
      
      // Create scalp strategy
      const scalpStrategy = new ScalpStrategy(
        binanceService,
        technicalAnalysis,
        dynamicLevels,
        positionManager
      );
      
      logger.info(`Successfully created services for ${config.symbol}`, {
        symbol: config.symbol,
        services: [
          'BinanceService',
          'TechnicalAnalysis',
          'PositionManager',
          'HedgeStrategy',
          'ScalpStrategy',
          'DynamicLevels',
          'ComprehensiveLevels'
        ]
      });
      
      return {
        binanceService,
        technicalAnalysis,
        positionManager,
        hedgeStrategy,
        scalpStrategy,
        dynamicLevels,
        comprehensiveLevels
      };
      
    } catch (error) {
      logger.error(`Failed to create services for ${config.symbol}`, error);
      throw error;
    }
  }
  
  /**
   * Create comprehensive levels service for a pair
   */
  private static async createComprehensiveLevels(config: PairConfig): Promise<ComprehensiveLevels> {
    try {
      // Load levels from file or use hardcoded
      const levels = await PairLoader.loadPairComprehensiveLevels(config);
      
      // Create comprehensive levels service with loaded data
      const comprehensiveLevels = new ComprehensiveLevels();
      
      // Set the loaded levels (we'll need to modify ComprehensiveLevels to accept external data)
      // For now, we'll use the existing hardcoded approach
      // TODO: Modify ComprehensiveLevels to accept external level data
      
      logger.info(`Loaded comprehensive levels for ${config.symbol}`, {
        symbol: config.symbol,
        levelCount: levels.length,
        resistanceLevels: levels.filter(l => l.type === 'RESISTANCE').length,
        supportLevels: levels.filter(l => l.type === 'SUPPORT').length
      });
      
      return comprehensiveLevels;
      
    } catch (error) {
      logger.error(`Failed to create comprehensive levels for ${config.symbol}`, error);
      throw error;
    }
  }
  
  /**
   * Get sizing recommendations for different pair counts
   */
  static getSizingRecommendations(): Record<number, string> {
    return this.sizingService.getSizingRecommendations();
  }

  /**
   * Validate multi-pair configuration safety
   */
  static validateMultiPairConfiguration(activePairs: string[], configs: PairConfig[]): {
    isSafe: boolean;
    totalExposure: number;
    maxSafe: number;
    recommendation: string;
    details: string;
  } {
    const sizingResult = this.sizingService.calculateOptimalSizing(activePairs);
    const validation = this.sizingService.validateConfiguration(activePairs, sizingResult.positionSizing);
    const details = this.sizingService.getDetailedBreakdown(activePairs, sizingResult.positionSizing);
    
    return {
      ...validation,
      details
    };
  }

  /**
   * Validate pair configuration before creating services
   */
  static validatePairConfig(config: PairConfig): string[] {
    const errors: string[] = [];
    
    // Basic validation
    if (!config.symbol) {
      errors.push('Symbol is required');
    }
    
    if (!config.name) {
      errors.push('Name is required');
    }
    
    if (config.baseBalance <= 0) {
      errors.push('Base balance must be greater than 0');
    }
    
    // Validate position sizing
    const totalSize = config.positionSizing.anchorPositionSize + 
                     config.positionSizing.anchorHedgeSize + 
                     config.positionSizing.opportunityPositionSize + 
                     config.positionSizing.opportunityHedgeSize;
    
    if (Math.abs(totalSize - 1.0) > 0.01) {
      errors.push(`Position sizes must add up to 100% (current: ${(totalSize * 100).toFixed(1)}%)`);
    }
    
    // Validate leverage settings
    if (config.leverageSettings.anchorLeverage <= 0) {
      errors.push('Anchor leverage must be greater than 0');
    }
    
    if (config.leverageSettings.hedgeLeverage <= 0) {
      errors.push('Hedge leverage must be greater than 0');
    }
    
    // Validate take profit percentages
    if (config.takeProfitPercentages.anchor <= 0) {
      errors.push('Anchor take profit percentage must be greater than 0');
    }
    
    if (config.takeProfitPercentages.opportunity <= 0) {
      errors.push('Opportunity take profit percentage must be greater than 0');
    }
    
    if (config.takeProfitPercentages.scalp <= 0) {
      errors.push('Scalp take profit percentage must be greater than 0');
    }
    
    // Validate file paths
    const fileErrors = PairLoader.validatePairFiles(config);
    errors.push(...fileErrors);
    
    return errors;
  }
}

export default PairFactory;
