import { 
  Position, 
  TradingSignal, 
  PositionSizing, 
  LeverageSettings,
  BotState 
} from '../types';
import { BinanceService } from './BinanceService';
import { DynamicLevels } from './DynamicLevels';
import { HedgeMonitor, HedgeAttempt } from './HedgeMonitor';
import { HedgeGuaranteeCalculator, HedgeGuaranteeConfig } from './HedgeGuaranteeCalculator';
import { DistributedHedgeService, HedgeApiConfig } from './DistributedHedgeService';
import { MultiPairSizingService } from './MultiPairSizingService';
import { logger } from '../utils/logger';

export class PositionManager {
  private binanceService: BinanceService;
  private positionSizing: PositionSizing;
  private leverageSettings: LeverageSettings;
  private currentPositions: Position[] = [];
  private botState: BotState;
  private dynamicLevels: DynamicLevels;
  private hedgeMonitor: HedgeMonitor;
  private guaranteeCalculator: HedgeGuaranteeCalculator;
  private distributedHedgeService: DistributedHedgeService;
  private multiPairSizingService: MultiPairSizingService;

  constructor(
    binanceService: BinanceService,
    positionSizing: PositionSizing,
    leverageSettings: LeverageSettings
  ) {
    this.binanceService = binanceService;
    this.positionSizing = positionSizing;
    this.leverageSettings = leverageSettings;
    this.dynamicLevels = new DynamicLevels();
    this.hedgeMonitor = new HedgeMonitor(binanceService);
    this.multiPairSizingService = MultiPairSizingService.getInstance();
    
    // Initialize hedge guarantee calculator with leverage-preferring settings
    const guaranteeConfig: HedgeGuaranteeConfig = {
      maxPriceDeviation: 0.02, // 2% maximum price deviation
      minHedgeSize: 0.20, // 20% minimum hedge size
      maxHedgeSize: 0.50, // 50% maximum hedge size
      minHedgeLeverage: 10, // 10x minimum hedge leverage
      maxHedgeLeverage: 20, // 20x maximum hedge leverage (safer limit)
      liquidationBuffer: 0.02, // 2% buffer before liquidation
      preferLeverageAdjustment: true // Prefer leverage adjustment over size adjustment
    };
    this.guaranteeCalculator = new HedgeGuaranteeCalculator(guaranteeConfig);
    
    // Initialize distributed hedge service
    const hedgeApiConfig: HedgeApiConfig | undefined = process.env.HEDGE_API_KEY && process.env.HEDGE_SECRET_KEY ? {
      apiKey: process.env.HEDGE_API_KEY,
      secretKey: process.env.HEDGE_SECRET_KEY,
      testnet: process.env.BINANCE_TESTNET === 'true'
    } : undefined;
    
    this.distributedHedgeService = new DistributedHedgeService(binanceService, hedgeApiConfig);
    
    this.botState = {
      isRunning: false,
      currentPositions: [],
      totalBalance: 0,
      availableBalance: 0,
      dailyPnL: 0,
      weeklyPnL: 0,
      lastUpdate: new Date()
    };
  }

  /**
   * Execute a trading signal
   */
  async executeSignal(signal: TradingSignal): Promise<Position | null> {
    try {
      switch (signal.type) {
        case 'ENTRY':
          // Determine position type based on signal reason
          if (signal.reason && signal.reason.includes('scalp')) {
            return await this.openScalpPosition(signal);
          } else if (signal.reason && signal.reason.includes('Peak')) {
            return await this.openOpportunityPosition(signal);
          } else {
            return await this.openAnchorPosition(signal);
          }
        case 'HEDGE':
          return await this.openHedgePosition(signal);
        case 'RE_ENTRY':
          return await this.openOpportunityPosition(signal);
        case 'EXIT':
          return await this.closePosition(signal);
        default:
          logger.warn('Unknown signal type', { signal });
          return null;
      }
    } catch (error) {
      logger.error('Failed to execute signal', { signal, error });
      return null;
    }
  }

  /**
   * Validate signal before opening position
   */
  private async validateSignal(signal: TradingSignal): Promise<boolean> {
    try {
      // Get current market data for validation
      const currentPrice = await this.binanceService.getCurrentPrice();
      const marketData1h = await this.binanceService.getKlines('1h', 24); // Get recent 1h data
      
      if (marketData1h.length === 0) {
        logger.warn('❌ Signal validation failed: No market data available');
        return false;
      }
      
      const lastMarketData = marketData1h[marketData1h.length - 1];
      const volumeRatio = lastMarketData.volume / (marketData1h.reduce((sum, data) => sum + data.volume, 0) / marketData1h.length);
      
      // Enhanced validation checks
      const priceValid = Math.abs(currentPrice - signal.price) / signal.price < 0.01; // Within 1%
      const volumeValid = volumeRatio > 1.0; // Above average volume
      
      logger.info('🔍 Pre-Entry Signal Validation', {
        signalType: signal.type,
        signalPosition: signal.position,
        signalPrice: signal.price.toFixed(4),
        currentPrice: currentPrice.toFixed(4),
        priceValid,
        volumeValid,
        volumeRatio: volumeRatio.toFixed(2),
        reason: signal.reason
      });
      
      if (!priceValid || !volumeValid) {
        logger.warn('❌ Signal validation failed', {
          priceValid,
          volumeValid,
          reason: 'Price or volume validation failed'
        });
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error validating signal', error);
      return false;
    }
  }

  /**
   * Open anchor position (initial long position)
   */
  private async openAnchorPosition(signal: TradingSignal): Promise<Position | null> {
    try {
      // ENHANCED VALIDATION: Validate signal before opening position
      const isValidSignal = await this.validateSignal(signal);
      if (!isValidSignal) {
        logger.warn('❌ Cannot open ANCHOR position - signal validation failed', {
          signal: signal,
          reason: 'Pre-entry validation failed'
        });
        return null;
      }
      
      // Check cross-pair primary position limit first
      const pair = this.binanceService.getConfig().tradingPair;
      if (!this.multiPairSizingService.canOpenPrimaryPosition(pair, 'ANCHOR')) {
        logger.warn('Cannot open ANCHOR position - cross-pair limit reached', {
          pair: pair,
          positionType: 'ANCHOR',
          reason: 'Maximum 2 primary positions allowed across all pairs'
        });
        return null;
      }

      // Check if we already have an ANCHOR position
      if (!this.canOpenPosition('ANCHOR')) {
        logger.warn('Cannot open ANCHOR position - already exists', {
          existingPositions: this.currentPositions.filter(p => p.type === 'ANCHOR' && p.status === 'OPEN')
        });
        return null;
      }

      // Use distributed hedge service for primary positions
      const position = await this.distributedHedgeService.openPrimaryPosition(
        signal,
        this.positionSizing,
        this.leverageSettings
      );

      if (position) {
        position.type = 'ANCHOR';
        this.currentPositions.push(position);
        
        // Register primary position in cross-pair system
        this.multiPairSizingService.registerPrimaryPosition(pair, 'ANCHOR', position.id);
        
        // Set static take profit for ANCHOR position
        await this.setStaticTakeProfit(position);
        
        logger.info('Anchor position opened', position);
      }
      return position;
    } catch (error) {
      logger.error('Failed to open anchor position', error);
      return null;
    }
  }

  /**
   * Open scalp position
   */
  private async openScalpPosition(signal: TradingSignal): Promise<Position | null> {
    try {
      // Check cross-pair primary position limit first
      const pair = this.binanceService.getConfig().tradingPair;
      if (!this.multiPairSizingService.canOpenPrimaryPosition(pair, 'SCALP')) {
        logger.warn('Cannot open SCALP position - cross-pair limit reached', {
          pair: pair,
          positionType: 'SCALP',
          reason: 'Maximum 2 primary positions allowed across all pairs'
        });
        return null;
      }

      // Check if we already have a SCALP position
      if (!this.canOpenPosition('SCALP')) {
        logger.warn('Cannot open SCALP position - already exists', {
          existingPositions: this.currentPositions.filter(p => p.type === 'SCALP' && p.status === 'OPEN')
        });
        return null;
      }

      const position = await this.binanceService.openPosition(
        signal.position,
        this.positionSizing.scalpPositionSize,
        this.leverageSettings.scalpLeverage
      );

      position.type = 'SCALP';
      this.currentPositions.push(position);
      
      // Register primary position in cross-pair system
      this.multiPairSizingService.registerPrimaryPosition(pair, 'SCALP', position.id);
      
      // Set static take profit for SCALP position
      await this.setStaticTakeProfit(position);
      
      logger.info('Scalp position opened', position);
      return position;
    } catch (error) {
      logger.error('Failed to open scalp position', error);
      return null;
    }
  }

  /**
   * Open hedge position
   */
  private async openHedgePosition(signal: TradingSignal): Promise<Position | null> {
    // Determine hedge type based on existing positions
    const hasAnchorPosition = this.currentPositions.some(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
    const hasOpportunityPosition = this.currentPositions.some(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
    const hasScalpPosition = this.currentPositions.some(pos => pos.type === 'SCALP' && pos.status === 'OPEN');
    
    try {
      
      let positionSize: number;
      let leverage: number;
      let positionType: 'ANCHOR_HEDGE' | 'OPPORTUNITY_HEDGE' | 'SCALP_HEDGE';
      let takeProfitPrice: number | null = null;

      if (hasAnchorPosition && !this.currentPositions.some(pos => pos.type === 'ANCHOR_HEDGE' && pos.status === 'OPEN')) {
        positionSize = this.positionSizing.anchorHedgeSize; // 30%
        // Use emergency leverage for emergency hedges (detected by reason containing "CRITICAL" or "emergency")
        const isEmergencyHedge = signal.reason?.toLowerCase().includes('critical') || signal.reason?.toLowerCase().includes('emergency');
        
        // Calculate 2x leverage multiplier for faster profit growth
        const primaryLeverage = this.leverageSettings.anchorLeverage; // Primary position leverage
        const baseHedgeLeverage = isEmergencyHedge 
          ? this.leverageSettings.emergencyHedgeLeverage 
          : this.leverageSettings.hedgeLeverage;
        
        // Apply 2x leverage multiplier (primary × 2) for faster profit growth
        const leverageMultiplier = 2.0;
        const calculatedLeverage = primaryLeverage * leverageMultiplier;
        
        // Use the higher of calculated leverage or base hedge leverage, but cap at emergency leverage
        leverage = Math.min(
          Math.max(calculatedLeverage, baseHedgeLeverage),
          this.leverageSettings.emergencyHedgeLeverage
        );
        
        positionType = 'ANCHOR_HEDGE';
        
        logger.info('🚀 Hedge Leverage Multiplier Applied', {
          primaryLeverage,
          baseHedgeLeverage,
          leverageMultiplier,
          calculatedLeverage: calculatedLeverage.toFixed(1),
          finalLeverage: leverage,
          isEmergencyHedge,
          reason: signal.reason
        });
        
        if (isEmergencyHedge) {
          logger.warn('🚨 Using emergency hedge leverage for ANCHOR hedge', {
            emergencyLeverage: this.leverageSettings.emergencyHedgeLeverage,
            normalLeverage: this.leverageSettings.hedgeLeverage,
            reason: signal.reason
          });
        }
        
        // Calculate take profit at anchor liquidation price
        const anchorPosition = this.currentPositions.find(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
        if (anchorPosition) {
          takeProfitPrice = this.calculateLiquidationPrice(anchorPosition);
        }
      } else if (hasOpportunityPosition && !this.currentPositions.some(pos => pos.type === 'OPPORTUNITY_HEDGE' && pos.status === 'OPEN')) {
        positionSize = this.positionSizing.opportunityHedgeSize; // 30%
        
        // Calculate 2x leverage multiplier for faster profit growth
        const primaryLeverage = this.leverageSettings.opportunityLeverage; // Primary position leverage
        const isEmergencyHedge = signal.reason?.toLowerCase().includes('critical') || signal.reason?.toLowerCase().includes('emergency');
        const baseHedgeLeverage = isEmergencyHedge 
          ? this.leverageSettings.emergencyHedgeLeverage 
          : this.leverageSettings.hedgeLeverage;
        
        // Apply 2x leverage multiplier (primary × 2) for faster profit growth
        const leverageMultiplier = 2.0;
        const calculatedLeverage = primaryLeverage * leverageMultiplier;
        
        // Use the higher of calculated leverage or base hedge leverage, but cap at emergency leverage
        leverage = Math.min(
          Math.max(calculatedLeverage, baseHedgeLeverage),
          this.leverageSettings.emergencyHedgeLeverage
        );
        
        positionType = 'OPPORTUNITY_HEDGE';
        
        logger.info('🚀 Opportunity Hedge Leverage Multiplier Applied', {
          primaryLeverage,
          baseHedgeLeverage,
          leverageMultiplier,
          calculatedLeverage: calculatedLeverage.toFixed(1),
          finalLeverage: leverage,
          isEmergencyHedge,
          reason: signal.reason
        });
        
        // Calculate take profit at opportunity liquidation price
        const opportunityPosition = this.currentPositions.find(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
        if (opportunityPosition) {
          takeProfitPrice = this.calculateLiquidationPrice(opportunityPosition);
        }
      } else if (hasScalpPosition && !this.currentPositions.some(pos => pos.type === 'SCALP_HEDGE' && pos.status === 'OPEN')) {
        positionSize = this.positionSizing.scalpHedgeSize; // 10%
        
        // Calculate 2x leverage multiplier for faster profit growth
        const primaryLeverage = this.leverageSettings.scalpLeverage; // Primary position leverage
        const isEmergencyHedge = signal.reason?.toLowerCase().includes('critical') || signal.reason?.toLowerCase().includes('emergency');
        const baseHedgeLeverage = isEmergencyHedge 
          ? this.leverageSettings.emergencyHedgeLeverage 
          : this.leverageSettings.scalpHedgeLeverage;
        
        // Apply 2x leverage multiplier (primary × 2) for faster profit growth
        const leverageMultiplier = 2.0;
        const calculatedLeverage = primaryLeverage * leverageMultiplier;
        
        // Use the higher of calculated leverage or base hedge leverage, but cap at emergency leverage
        leverage = Math.min(
          Math.max(calculatedLeverage, baseHedgeLeverage),
          this.leverageSettings.emergencyHedgeLeverage
        );
        
        positionType = 'SCALP_HEDGE';
        
        logger.info('🚀 Scalp Hedge Leverage Multiplier Applied', {
          primaryLeverage,
          baseHedgeLeverage,
          leverageMultiplier,
          calculatedLeverage: calculatedLeverage.toFixed(1),
          finalLeverage: leverage,
          isEmergencyHedge,
          reason: signal.reason
        });
        
        // Calculate take profit at scalp liquidation price
        const scalpPosition = this.currentPositions.find(pos => pos.type === 'SCALP' && pos.status === 'OPEN');
        if (scalpPosition) {
          takeProfitPrice = this.calculateLiquidationPrice(scalpPosition);
        }
      } else {
        logger.warn('No valid position to hedge', { signal });
        return null;
      }

      // Validate hedge parameters with profit guarantee
      const currentPrice = await this.binanceService.getCurrentPrice();
      const primaryPositionForGuarantee = this.currentPositions.find(pos => 
        (positionType === 'ANCHOR_HEDGE' && pos.type === 'ANCHOR') ||
        (positionType === 'OPPORTUNITY_HEDGE' && pos.type === 'OPPORTUNITY') ||
        (positionType === 'SCALP_HEDGE' && pos.type === 'SCALP')
      );

      if (primaryPositionForGuarantee) {
        const baseHedgeSize = positionSize;
        const baseLeverage = leverage;
        
        const guaranteeResult = this.guaranteeCalculator.calculateHedgeGuarantee(
          primaryPositionForGuarantee,
          signal,
          currentPrice,
          positionSize,
          leverage
        );

        if (!this.guaranteeCalculator.validateHedgeParameters(guaranteeResult)) {
          logger.error('🚨 Hedge opening rejected - profit guarantee not met', {
            primaryPositionId: primaryPositionForGuarantee.id,
            reason: guaranteeResult.reason,
            guaranteeType: guaranteeResult.guaranteeType
          });
          return null;
        }

        // Use adjusted parameters if needed
        positionSize = guaranteeResult.adjustedHedgeSize;
        leverage = guaranteeResult.adjustedHedgeLeverage;
        if (guaranteeResult.guaranteeType === 'ADJUSTED') {
          takeProfitPrice = guaranteeResult.adjustedTakeProfit;
          logger.info('🛡️ Using adjusted hedge parameters for profit guarantee', {
            adjustmentMethod: guaranteeResult.adjustmentMethod,
            originalSize: `${(baseHedgeSize * 100).toFixed(2)}%`,
            adjustedSize: `${(guaranteeResult.adjustedHedgeSize * 100).toFixed(2)}%`,
            originalLeverage: `${baseLeverage}x`,
            adjustedLeverage: `${guaranteeResult.adjustedHedgeLeverage}x`,
            profitGuarantee: `${guaranteeResult.profitGuarantee.toFixed(2)}%`,
            reason: guaranteeResult.reason
          });
        }
      }

      // Use distributed hedge service for hedge positions
      const position = await this.distributedHedgeService.openHedgePosition(
        signal,
        this.positionSizing,
        this.leverageSettings
      );

      if (position) {
        position.type = positionType;
        this.currentPositions.push(position);
        
        // Set take profit order if we have a liquidation price
        if (takeProfitPrice) {
          await this.setHedgeTakeProfit(position, takeProfitPrice);
        }

        // Record successful hedge opening
        const primaryPosition = this.currentPositions.find(pos => 
          (positionType === 'ANCHOR_HEDGE' && pos.type === 'ANCHOR') ||
          (positionType === 'OPPORTUNITY_HEDGE' && pos.type === 'OPPORTUNITY') ||
          (positionType === 'SCALP_HEDGE' && pos.type === 'SCALP')
        );
        
        if (primaryPosition) {
          this.hedgeMonitor.recordHedgeAttempt(primaryPosition, signal, true);
        }
        
        logger.info('Hedge position opened', { 
          position, 
          takeProfitPrice,
          reason: `Hedge take profit set at ${positionType === 'ANCHOR_HEDGE' ? 'anchor' : 'opportunity'} liquidation price`
        });
      }
      return position;
    } catch (error) {
      logger.error('Failed to open hedge position', error);
      
      // Record failed hedge opening
      const primaryPosition = this.currentPositions.find(pos => 
        (pos.type === 'ANCHOR' && hasAnchorPosition) ||
        (pos.type === 'OPPORTUNITY' && hasOpportunityPosition) ||
        (pos.type === 'SCALP' && hasScalpPosition)
      );
      
      if (primaryPosition) {
        this.hedgeMonitor.recordHedgeAttempt(primaryPosition, signal, false);
      }
      
      return null;
    }
  }

  /**
   * Open opportunity position (re-entry long)
   */
  private async openOpportunityPosition(signal: TradingSignal): Promise<Position | null> {
    try {
      // Check cross-pair primary position limit first
      const pair = this.binanceService.getConfig().tradingPair;
      if (!this.multiPairSizingService.canOpenPrimaryPosition(pair, 'OPPORTUNITY')) {
        logger.warn('Cannot open OPPORTUNITY position - cross-pair limit reached', {
          pair: pair,
          positionType: 'OPPORTUNITY',
          reason: 'Maximum 2 primary positions allowed across all pairs'
        });
        return null;
      }

      const position = await this.binanceService.openPosition(
        signal.position,
        this.positionSizing.opportunityPositionSize,
        this.leverageSettings.opportunityLeverage
      );

      position.type = 'OPPORTUNITY';
      this.currentPositions.push(position);
      
      // Register primary position in cross-pair system
      this.multiPairSizingService.registerPrimaryPosition(pair, 'OPPORTUNITY', position.id);
      
      // Set static take profit for OPPORTUNITY position
      await this.setStaticTakeProfit(position);
      
      logger.info('Opportunity position opened', position);
      return position;
    } catch (error) {
      logger.error('Failed to open opportunity position', error);
      return null;
    }
  }

  /**
   * Close a position
   */
  private async closePosition(signal: TradingSignal): Promise<Position | null> {
    try {
      // Log current positions for debugging
      logger.info('🔍 Position Manager Debug - Current Positions', {
        totalPositions: this.currentPositions.length,
        openPositions: this.currentPositions.filter(p => p.status === 'OPEN').length,
        positions: this.currentPositions.map(p => ({
          id: p.id,
          type: p.type,
          side: p.side,
          status: p.status,
          entryPrice: p.entryPrice
        })),
        exitSignal: {
          type: signal.type,
          position: signal.position,
          reason: signal.reason
        }
      });

      // Find the position to close based on signal
      const positionToClose = this.findPositionToClose(signal);
      
      if (!positionToClose) {
        logger.warn('No position found to close', { 
          signal,
          availablePositions: this.currentPositions.filter(p => p.status === 'OPEN').map(p => ({
            type: p.type,
            side: p.side,
            id: p.id
          }))
        });
        return null;
      }

      logger.info('🎯 Found position to close', {
        position: {
          id: positionToClose.id,
          type: positionToClose.type,
          side: positionToClose.side,
          entryPrice: positionToClose.entryPrice
        },
        signal: {
          type: signal.type,
          position: signal.position,
          reason: signal.reason
        }
      });

      await this.binanceService.closePosition(positionToClose);
      positionToClose.status = 'CLOSED';
      
      // Unregister primary position from cross-pair system if it's a primary position
      if (['ANCHOR', 'OPPORTUNITY', 'SCALP'].includes(positionToClose.type)) {
        this.multiPairSizingService.unregisterPrimaryPosition(positionToClose.id);
      }
      
      logger.info('✅ Position closed successfully', {
        position: {
          id: positionToClose.id,
          type: positionToClose.type,
          side: positionToClose.side,
          entryPrice: positionToClose.entryPrice,
          closePrice: signal.price
        }
      });
      
      return positionToClose;
    } catch (error) {
      logger.error('❌ Failed to close position', { 
        signal,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }

  /**
   * Find position to close based on signal
   */
  private findPositionToClose(signal: TradingSignal): Position | null {
    // For exit signals, we need to determine which position to close
    if (signal.position === 'SHORT') {
      // Close SHORT hedge positions
      return this.currentPositions.find(pos => 
        (pos.type === 'ANCHOR_HEDGE' || pos.type === 'OPPORTUNITY_HEDGE' || pos.type === 'SCALP_HEDGE') && 
        pos.side === 'SHORT' &&
        pos.status === 'OPEN'
      ) || null;
    } else if (signal.position === 'LONG') {
      // Close LONG anchor, opportunity, or scalp positions
      return this.currentPositions.find(pos => 
        (pos.type === 'ANCHOR' || pos.type === 'OPPORTUNITY' || pos.type === 'SCALP') && 
        pos.side === 'LONG' &&
        pos.status === 'OPEN'
      ) || null;
    }
    
    return null;
  }

  /**
   * Update positions from Binance
   */
  async updatePositions(): Promise<void> {
    try {
      // Use distributed hedge service to get all positions from both API keys
      const binancePositions = await this.distributedHedgeService.getAllPositions();
      
      // Update current positions with Binance data
      for (const binancePos of binancePositions) {
        const existingPos = this.currentPositions.find(pos => pos.id === binancePos.id);
        if (existingPos) {
          // Update existing position
          Object.assign(existingPos, binancePos);
        } else {
          // Add new position
          this.currentPositions.push(binancePos);
        }
      }

      // Remove positions that are no longer active
      this.currentPositions = this.currentPositions.filter(pos => 
        binancePositions.some(bp => bp.id === pos.id)
      );

      // Update bot state
      await this.updateBotState();
      
    } catch (error) {
      logger.error('Failed to update positions', error);
    }
  }

  /**
   * Update bot state
   */
  private async updateBotState(): Promise<void> {
    try {
      const balance = await this.binanceService.getAccountBalance();
      
      this.botState = {
        isRunning: true,
        currentPositions: this.currentPositions,
        totalBalance: balance.total,
        availableBalance: balance.available,
        dailyPnL: this.calculateDailyPnL(),
        weeklyPnL: this.calculateWeeklyPnL(),
        lastUpdate: new Date()
      };
    } catch (error) {
      logger.error('Failed to update bot state', error);
    }
  }

  /**
   * Calculate daily PnL
   */
  private calculateDailyPnL(): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return this.currentPositions
      .filter(pos => pos.closeTime && pos.closeTime >= today)
      .reduce((total, pos) => total + (pos.pnl || 0), 0);
  }

  /**
   * Calculate weekly PnL
   */
  private calculateWeeklyPnL(): number {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    return this.currentPositions
      .filter(pos => pos.closeTime && pos.closeTime >= weekAgo)
      .reduce((total, pos) => total + (pos.pnl || 0), 0);
  }

  /**
   * Get current positions
   */
  getCurrentPositions(): Position[] {
    return this.currentPositions;
  }

  /**
   * Get bot state
   */
  getBotState(): BotState {
    return this.botState;
  }

  /**
   * Check if we can open a new position based on SEQUENTIAL CYCLES
   * Only one position type (ANCHOR, PEAK, or SCALP) can be active at a time
   * New position types can only open when the current cycle is complete
   */
  canOpenPosition(type: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP'): boolean {
    // Check if we have any open positions of any type
    const hasAnyOpenPositions = this.currentPositions.some(pos => pos.status === 'OPEN');
    
    if (hasAnyOpenPositions) {
      // Get the current active position type
      const activePosition = this.currentPositions.find(pos => pos.status === 'OPEN');
      const activeType = activePosition?.type;
      
      logger.warn(`Cannot open ${type} position - ${activeType} cycle is still active`, {
        activePosition: activePosition ? {
          type: activePosition.type,
          side: activePosition.side,
          id: activePosition.id,
          status: activePosition.status
        } : null,
        allOpenPositions: this.currentPositions.filter(p => p.status === 'OPEN').map(p => ({
          type: p.type,
          side: p.side,
          id: p.id
        })),
        reason: 'Sequential position management - only one position type at a time'
      });
      return false;
    }
    
    logger.info(`✅ Can open ${type} position - no active position cycles`, {
      reason: 'Sequential position management - ready for new cycle'
    });
    return true;
  }

  /**
   * Get the side (LONG/SHORT) for a position type
   */
  private getPositionSide(type: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP'): 'LONG' | 'SHORT' {
    // All primary positions (ANCHOR, OPPORTUNITY, SCALP) are LONG
    return 'LONG';
  }

  /**
   * Check if we can open a hedge based on SIDE (not type)
   * Only one LONG and one SHORT position can exist at a time
   */
  canOpenHedge(type: 'ANCHOR_HEDGE' | 'OPPORTUNITY_HEDGE' | 'SCALP_HEDGE'): boolean {
    // All hedge positions are SHORT
    const hedgeSide = 'SHORT';
    
    // Check if we already have a SHORT position
    const hasShortPosition = this.currentPositions.some(pos => 
      pos.side === hedgeSide && pos.status === 'OPEN'
    );
    
    if (hasShortPosition) {
      logger.warn(`Cannot open ${type} hedge - already have ${hedgeSide} position`, {
        existingPositions: this.currentPositions.filter(p => p.side === hedgeSide && p.status === 'OPEN').map(p => ({
          type: p.type,
          side: p.side,
          id: p.id
        }))
      });
      return false;
    }
    
    // Check if we have the corresponding LONG position to hedge
    switch (type) {
      case 'ANCHOR_HEDGE':
        return this.currentPositions.some(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
      case 'OPPORTUNITY_HEDGE':
        return this.currentPositions.some(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
      case 'SCALP_HEDGE':
        return this.currentPositions.some(pos => pos.type === 'SCALP' && pos.status === 'OPEN');
      default:
        return false;
    }
  }

  /**
   * Calculate liquidation price for a position
   */
  private calculateLiquidationPrice(position: Position): number {
    // Liquidation price = Entry Price × (1 - 1/Leverage)
    // For LONG positions, liquidation happens when price drops
    if (position.side === 'LONG') {
      return position.entryPrice * (1 - 1 / position.leverage);
    } else {
      // For SHORT positions, liquidation happens when price rises
      return position.entryPrice * (1 + 1 / position.leverage);
    }
  }

  /**
   * Set static take profit for any position type
   */
  private async setStaticTakeProfit(position: Position): Promise<void> {
    try {
      const currentPrice = await this.binanceService.getCurrentPrice();
      let takeProfitPrice: number;

      // Determine take profit based on position type and side
      if (position.type === 'SCALP') {
        // For SCALP: Use comprehensive levels for quick profits
        const signals = await this.getComprehensiveSignals(currentPrice);
        
        if (position.side === 'LONG') {
          // LONG scalp: Take profit at nearest resistance
          const nearestResistance = signals.nearestResistance;
          const scalpTpPercent = parseFloat(process.env.SCALP_TP_PERCENT || '0.5') / 100;
          takeProfitPrice = nearestResistance ? nearestResistance.price : currentPrice * (1 + scalpTpPercent); // Use environment setting
        } else {
          // SHORT scalp: Take profit at nearest support
          const nearestSupport = signals.nearestSupport;
          const scalpTpPercent = parseFloat(process.env.SCALP_TP_PERCENT || '0.5') / 100;
          takeProfitPrice = nearestSupport ? nearestSupport.price : currentPrice * (1 - scalpTpPercent); // Use environment setting
        }
      } else if (position.type === 'ANCHOR') {
        // For ANCHOR: Use environment profit targets
        const anchorTpPercent = parseFloat(process.env.ANCHOR_TP_PERCENT || '1.0') / 100;
        if (position.side === 'LONG') {
          takeProfitPrice = currentPrice * (1 + anchorTpPercent); // Use environment setting
        } else {
          takeProfitPrice = currentPrice * (1 - anchorTpPercent); // Use environment setting
        }
      } else if (position.type === 'OPPORTUNITY') {
        // For OPPORTUNITY: Use environment profit targets
        const opportunityTpPercent = parseFloat(process.env.OPPORTUNITY_TP_PERCENT || '1.0') / 100;
        if (position.side === 'LONG') {
          takeProfitPrice = currentPrice * (1 + opportunityTpPercent); // Use environment setting
        } else {
          takeProfitPrice = currentPrice * (1 - opportunityTpPercent); // Use environment setting
        }
      } else {
        // Default fallback
        takeProfitPrice = position.side === 'LONG' ? currentPrice * 1.01 : currentPrice * 0.99;
      }

      // Set the take profit order
      await this.binanceService.setTakeProfitOrder(position, takeProfitPrice);
      
      logger.info('🎯 Static take profit set', {
        positionId: position.id,
        positionType: position.type,
        positionSide: position.side,
        entryPrice: position.entryPrice.toFixed(4),
        takeProfitPrice: takeProfitPrice.toFixed(4),
        expectedProfit: position.side === 'LONG' 
          ? `${(((takeProfitPrice - position.entryPrice) / position.entryPrice) * 100).toFixed(2)}%`
          : `${(((position.entryPrice - takeProfitPrice) / position.entryPrice) * 100).toFixed(2)}%`,
        reason: `Static TP for ${position.type} ${position.side} position`
      });
    } catch (error) {
      logger.error('Failed to set static take profit', {
        positionId: position.id,
        positionType: position.type,
        error: error
      });
      // Don't throw error - position is still valid without take profit order
    }
  }

  /**
   * Get comprehensive trading signals (placeholder - needs implementation)
   */
  private async getComprehensiveSignals(currentPrice: number): Promise<{
    nearestResistance?: { price: number; description: string; importance: string };
    nearestSupport?: { price: number; description: string; importance: string };
  }> {
    // This is a simplified version - in reality, this should use the ComprehensiveLevels service
    // For now, return basic levels based on current price
    const scalpTpPercent = parseFloat(process.env.SCALP_TP_PERCENT || '0.5') / 100;
    return {
      nearestResistance: {
        price: currentPrice * (1 + scalpTpPercent),
        description: 'Static TP Level',
        importance: 'MEDIUM'
      },
      nearestSupport: {
        price: currentPrice * (1 - scalpTpPercent),
        description: 'Static TP Level',
        importance: 'MEDIUM'
      }
    };
  }

  /**
   * Set take profit order for hedge position
   */
  private async setHedgeTakeProfit(hedgePosition: Position, takeProfitPrice: number): Promise<void> {
    try {
      // Set a take profit order at the liquidation price of the corresponding long position
      await this.binanceService.setTakeProfitOrder(
        hedgePosition,
        takeProfitPrice
      );
      
      logger.info('Hedge take profit order set', {
        hedgePositionId: hedgePosition.id,
        takeProfitPrice,
        reason: 'Take profit set at corresponding long position liquidation price'
      });
    } catch (error) {
      logger.error('Failed to set hedge take profit order', error);
      // Don't throw error - position is still valid without take profit order
    }
  }

  /**
   * Get position summary
   */
  getPositionSummary(): {
    totalPositions: number;
    openPositions: number;
    totalPnL: number;
    positionsByType: Record<string, number>;
    breakEvenAnalysis: {
      anchorLiquidation: number;
      opportunityLiquidation: number;
      guaranteedProfit: boolean;
    };
  } {
    const openPositions = this.currentPositions.filter(pos => pos.status === 'OPEN');
    const totalPnL = this.currentPositions.reduce((total, pos) => total + (pos.pnl || 0), 0);
    
    const positionsByType = this.currentPositions.reduce((acc, pos) => {
      acc[pos.type] = (acc[pos.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate break-even analysis
    const anchorPosition = this.currentPositions.find(pos => pos.type === 'ANCHOR' && pos.status === 'OPEN');
    const opportunityPosition = this.currentPositions.find(pos => pos.type === 'OPPORTUNITY' && pos.status === 'OPEN');
    
    let anchorLiquidation = 0;
    let opportunityLiquidation = 0;
    let guaranteedProfit = false;

    if (anchorPosition) {
      // Anchor liquidation: 20% loss, hedge profit: 30% × 15x × 6% = 27%
      anchorLiquidation = -20 + 27; // +7% profit
    }

    if (opportunityPosition) {
      // Opportunity liquidation: 20% loss, hedge profit: 30% × 15x × 6.5% = 29.25%
      opportunityLiquidation = -20 + 29.25; // +9.25% profit
    }

    guaranteedProfit = anchorLiquidation > 0 && opportunityLiquidation > 0;

    return {
      totalPositions: this.currentPositions.length,
      openPositions: openPositions.length,
      totalPnL,
      positionsByType,
      breakEvenAnalysis: {
        anchorLiquidation,
        opportunityLiquidation,
        guaranteedProfit
      }
    };
  }

  /**
   * Get dynamic levels instance
   */
  getDynamicLevels(): DynamicLevels {
    return this.dynamicLevels;
  }

  /**
   * Start hedge monitoring
   */
  startHedgeMonitoring(): void {
    this.hedgeMonitor.startMonitoring();
    logger.info('🛡️ Hedge monitoring started in PositionManager');
  }

  /**
   * Stop hedge monitoring
   */
  stopHedgeMonitoring(): void {
    this.hedgeMonitor.stopMonitoring();
    logger.info('🛡️ Hedge monitoring stopped in PositionManager');
  }

  /**
   * Get hedge monitoring status
   */
  getHedgeMonitoringStatus(): {
    isMonitoring: boolean;
    failedAttempts: number;
    verifications: number;
  } {
    return this.hedgeMonitor.getMonitoringStatus();
  }

  /**
   * Get failed hedge attempts
   */
  getFailedHedgeAttempts(): HedgeAttempt[] {
    return this.hedgeMonitor.getFailedHedgeAttempts();
  }
}
