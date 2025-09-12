import { Position, TradingSignal } from '../types';
import { BinanceService } from './BinanceService';
import { HedgeGuaranteeCalculator, HedgeGuaranteeConfig } from './HedgeGuaranteeCalculator';
import { logger } from '../utils/logger';

export interface HedgeAttempt {
  primaryPositionId: string;
  primaryPositionType: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP';
  primaryPositionSide: 'LONG' | 'SHORT';
  hedgeSignal: TradingSignal;
  attemptCount: number;
  lastAttempt: Date;
  maxAttempts: number;
  retryDelay: number; // milliseconds
}

interface HedgeVerification {
  primaryPositionId: string;
  hedgePositionId?: string | undefined;
  isHedgeOpen: boolean;
  hedgeEntryPrice?: number | undefined;
  verificationTime: Date;
  error?: string | undefined;
}

export class HedgeMonitor {
  private binanceService: BinanceService;
  private failedHedgeAttempts: Map<string, HedgeAttempt> = new Map();
  private hedgeVerifications: Map<string, HedgeVerification> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private isMonitoring: boolean = false;
  private guaranteeCalculator: HedgeGuaranteeCalculator;

  constructor(binanceService: BinanceService) {
    this.binanceService = binanceService;
    
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
  }

  /**
   * Start monitoring hedge positions
   */
  startMonitoring(): void {
    if (this.isMonitoring) {
      logger.warn('Hedge monitoring is already running');
      return;
    }

    this.isMonitoring = true;
    this.monitoringInterval = setInterval(async () => {
      await this.performHedgeMonitoring();
    }, 30000); // Check every 30 seconds

    logger.info('🛡️ Hedge monitoring started', {
      interval: '30s',
      symbol: this.binanceService.getTradingPair()
    });
  }

  /**
   * Stop monitoring hedge positions
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    this.isMonitoring = false;
    logger.info('🛡️ Hedge monitoring stopped');
  }

  /**
   * Record a hedge opening attempt
   */
  recordHedgeAttempt(
    primaryPosition: Position,
    hedgeSignal: TradingSignal,
    success: boolean
  ): void {
    const key = primaryPosition.id;
    
    if (success) {
      // Remove from failed attempts if successful
      this.failedHedgeAttempts.delete(key);
      logger.info('✅ Hedge opening successful', {
        primaryPositionId: primaryPosition.id,
        primaryPositionType: primaryPosition.type,
        hedgeDirection: hedgeSignal.position
      });
    } else {
      // Record failed attempt
      const existingAttempt = this.failedHedgeAttempts.get(key);
      const attemptCount = existingAttempt ? existingAttempt.attemptCount + 1 : 1;
      
      this.failedHedgeAttempts.set(key, {
        primaryPositionId: primaryPosition.id,
        primaryPositionType: primaryPosition.type as 'ANCHOR' | 'OPPORTUNITY' | 'SCALP',
        primaryPositionSide: primaryPosition.side,
        hedgeSignal,
        attemptCount,
        lastAttempt: new Date(),
        maxAttempts: 5,
        retryDelay: Math.min(1000 * Math.pow(2, attemptCount - 1), 30000) // Exponential backoff, max 30s
      });

      logger.error('❌ Hedge opening failed - recorded for retry', {
        primaryPositionId: primaryPosition.id,
        primaryPositionType: primaryPosition.type,
        attemptCount,
        nextRetryIn: `${Math.min(1000 * Math.pow(2, attemptCount - 1), 30000) / 1000}s`,
        hedgeDirection: hedgeSignal.position,
        reason: hedgeSignal.reason
      });
    }
  }

  /**
   * Verify if a hedge position is actually open
   */
  async verifyHedgePosition(primaryPosition: Position): Promise<HedgeVerification> {
    try {
      // Get all open positions from Binance
      const openPositions = await this.binanceService.getOpenPositions();
      
      // Look for hedge position (opposite side of primary)
      const hedgePosition = openPositions.find(pos => 
        pos.symbol === primaryPosition.symbol &&
        pos.side !== primaryPosition.side &&
        pos.status === 'OPEN'
      );

      const verification: HedgeVerification = {
        primaryPositionId: primaryPosition.id,
        hedgePositionId: hedgePosition?.id || undefined,
        isHedgeOpen: !!hedgePosition,
        hedgeEntryPrice: hedgePosition?.entryPrice,
        verificationTime: new Date()
      };

      this.hedgeVerifications.set(primaryPosition.id, verification);

      if (!hedgePosition) {
        logger.warn('⚠️ Hedge verification failed - no hedge position found', {
          primaryPositionId: primaryPosition.id,
          primaryPositionType: primaryPosition.type,
          primaryPositionSide: primaryPosition.side,
          expectedHedgeSide: primaryPosition.side === 'LONG' ? 'SHORT' : 'LONG'
        });
      } else {
        logger.info('✅ Hedge verification successful', {
          primaryPositionId: primaryPosition.id,
          hedgePositionId: hedgePosition.id,
          hedgeEntryPrice: hedgePosition.entryPrice,
          hedgeSide: hedgePosition.side
        });
      }

      return verification;
    } catch (error) {
      const verification: HedgeVerification = {
        primaryPositionId: primaryPosition.id,
        isHedgeOpen: false,
        verificationTime: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.hedgeVerifications.set(primaryPosition.id, verification);

      logger.error('❌ Hedge verification failed - API error', {
        primaryPositionId: primaryPosition.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return verification;
    }
  }

  /**
   * Perform monitoring checks
   */
  private async performHedgeMonitoring(): Promise<void> {
    try {
      // Clean up attempts for closed positions first
      await this.cleanupClosedPositions();
      
      // Check for positions that need hedge verification
      const openPositions = await this.binanceService.getOpenPositions();
      const primaryPositions = openPositions.filter(pos => 
        ['ANCHOR', 'OPPORTUNITY', 'SCALP'].includes(pos.type) && pos.status === 'OPEN'
      );

      for (const position of primaryPositions) {
        // Verify hedge exists
        const verification = await this.verifyHedgePosition(position);
        
        if (!verification.isHedgeOpen) {
          // Check if we should retry hedge opening
          await this.handleMissingHedge(position);
        }
      }

      // Process failed hedge attempts
      await this.processFailedHedgeAttempts();
      
    } catch (error) {
      logger.error('Error in hedge monitoring', error);
    }
  }

  /**
   * Handle missing hedge positions
   */
  private async handleMissingHedge(primaryPosition: Position): Promise<void> {
    const key = primaryPosition.id;
    const existingAttempt = this.failedHedgeAttempts.get(key);
    
    if (existingAttempt) {
      // Already being retried
      return;
    }

    // Create hedge signal for missing hedge
    const hedgeSignal: TradingSignal = {
      type: 'HEDGE',
      position: primaryPosition.side === 'LONG' ? 'SHORT' : 'LONG',
      price: await this.binanceService.getCurrentPrice(),
      confidence: 1.0,
      reason: `CRITICAL: Missing hedge for ${primaryPosition.type} position - emergency hedge opening`,
      timestamp: new Date()
    };

    // Record as failed attempt to trigger retry
    this.recordHedgeAttempt(primaryPosition, hedgeSignal, false);

    logger.error('🚨 CRITICAL: Missing hedge detected', {
      primaryPositionId: primaryPosition.id,
      primaryPositionType: primaryPosition.type,
      primaryPositionSide: primaryPosition.side,
      primaryEntryPrice: primaryPosition.entryPrice,
      currentPrice: hedgeSignal.price,
      pnl: primaryPosition.side === 'LONG' 
        ? ((hedgeSignal.price - primaryPosition.entryPrice) / primaryPosition.entryPrice * 100).toFixed(2) + '%'
        : ((primaryPosition.entryPrice - hedgeSignal.price) / primaryPosition.entryPrice * 100).toFixed(2) + '%',
      action: 'Emergency hedge retry initiated'
    });
  }

  /**
   * Process failed hedge attempts and retry
   */
  private async processFailedHedgeAttempts(): Promise<void> {
    const now = new Date();
    
    for (const [key, attempt] of this.failedHedgeAttempts.entries()) {
      // Check if it's time to retry
      const timeSinceLastAttempt = now.getTime() - attempt.lastAttempt.getTime();
      
      if (timeSinceLastAttempt >= attempt.retryDelay) {
        if (attempt.attemptCount >= attempt.maxAttempts) {
          // Max initial attempts reached - switch to continuous retry mode
          if (attempt.retryDelay === 30000) {
            // Already in continuous mode, proceed with retry
            await this.retryHedgeOpening(attempt);
          } else {
            // Switch to continuous retry mode (every 30 seconds)
            attempt.retryDelay = 30000; // 30 seconds
            attempt.lastAttempt = now;
            
            logger.warn('🔄 Switching to continuous hedge retry mode', {
              primaryPositionId: attempt.primaryPositionId,
              primaryPositionType: attempt.primaryPositionType,
              initialAttempts: attempt.attemptCount,
              newRetryInterval: '30s',
              action: 'Continuous retry until hedge opens or position closes'
            });
            
            // Proceed with retry immediately
            await this.retryHedgeOpening(attempt);
          }
        } else {
          // Still in initial retry phase - use exponential backoff
          await this.retryHedgeOpening(attempt);
        }
      }
    }
  }

  /**
   * Retry hedge opening with profit guarantee validation
   */
  private async retryHedgeOpening(attempt: HedgeAttempt): Promise<void> {
    try {
      logger.info('🔄 Retrying hedge opening with profit guarantee validation', {
        primaryPositionId: attempt.primaryPositionId,
        attemptCount: attempt.attemptCount + 1,
        maxAttempts: attempt.maxAttempts,
        hedgeDirection: attempt.hedgeSignal.position
      });

      // Get current price for guarantee calculation
      const currentPrice = await this.binanceService.getCurrentPrice();
      
      // Create a mock primary position for calculation
      const mockPrimaryPosition: Position = {
        id: attempt.primaryPositionId,
        symbol: this.binanceService.getTradingPair(),
        side: attempt.primaryPositionSide,
        type: attempt.primaryPositionType,
        entryPrice: 0, // Will be fetched from actual position
        quantity: 0,
        leverage: 0,
        status: 'OPEN'
      };

      // Calculate hedge parameters with profit guarantee
      const baseHedgeSize = this.getHedgeSize(attempt.primaryPositionType);
      const baseLeverage = this.getHedgeLeverage(attempt.primaryPositionType);
      
      const guaranteeResult = this.guaranteeCalculator.calculateHedgeGuarantee(
        mockPrimaryPosition,
        attempt.hedgeSignal,
        currentPrice,
        baseHedgeSize,
        baseLeverage
      );

      // Validate hedge parameters
      if (!this.guaranteeCalculator.validateHedgeParameters(guaranteeResult)) {
        // Hedge parameters don't guarantee profit - skip this retry
        attempt.attemptCount++;
        attempt.lastAttempt = new Date();
        attempt.retryDelay = Math.min(1000 * Math.pow(2, attempt.attemptCount - 1), 30000);
        
        logger.warn('🛡️ Hedge retry skipped - profit guarantee not met', {
          primaryPositionId: attempt.primaryPositionId,
          attemptCount: attempt.attemptCount,
          reason: guaranteeResult.reason,
          nextRetryIn: `${attempt.retryDelay / 1000}s`
        });
        return;
      }

      // Open hedge position with adjusted parameters
      const hedgePosition = await this.binanceService.openPosition(
        attempt.hedgeSignal.position,
        guaranteeResult.adjustedHedgeSize,
        baseLeverage
      );

      // Verify hedge was opened successfully
      const verification = await this.verifyHedgePosition({
        id: attempt.primaryPositionId,
        type: attempt.primaryPositionType,
        side: attempt.primaryPositionSide,
        symbol: this.binanceService.getTradingPair(),
        entryPrice: 0,
        quantity: 0,
        leverage: 0,
        status: 'OPEN'
      } as Position);

      if (verification.isHedgeOpen) {
        // Success - remove from failed attempts
        this.failedHedgeAttempts.delete(attempt.primaryPositionId);
        
        logger.info('✅ Hedge retry successful', {
          primaryPositionId: attempt.primaryPositionId,
          hedgePositionId: verification.hedgePositionId,
          attemptCount: attempt.attemptCount + 1,
          mode: attempt.retryDelay === 30000 ? 'continuous' : 'initial'
        });
      } else {
        // Still failed - update attempt
        attempt.attemptCount++;
        attempt.lastAttempt = new Date();
        
        // Update retry delay based on current mode
        if (attempt.retryDelay === 30000) {
          // Already in continuous mode - keep 30 second interval
          attempt.retryDelay = 30000;
        } else {
          // Still in initial phase - use exponential backoff
          attempt.retryDelay = Math.min(1000 * Math.pow(2, attempt.attemptCount - 1), 30000);
        }
        
        const mode = attempt.retryDelay === 30000 ? 'continuous' : 'initial';
        const nextRetryIn = attempt.retryDelay === 30000 ? '30s' : `${attempt.retryDelay / 1000}s`;
        
        logger.error('❌ Hedge retry failed', {
          primaryPositionId: attempt.primaryPositionId,
          attemptCount: attempt.attemptCount,
          mode: mode,
          nextRetryIn: nextRetryIn
        });
      }
    } catch (error) {
      // Update attempt
      attempt.attemptCount++;
      attempt.lastAttempt = new Date();
      
      // Update retry delay based on current mode
      if (attempt.retryDelay === 30000) {
        // Already in continuous mode - keep 30 second interval
        attempt.retryDelay = 30000;
      } else {
        // Still in initial phase - use exponential backoff
        attempt.retryDelay = Math.min(1000 * Math.pow(2, attempt.attemptCount - 1), 30000);
      }
      
      const mode = attempt.retryDelay === 30000 ? 'continuous' : 'initial';
      const nextRetryIn = attempt.retryDelay === 30000 ? '30s' : `${attempt.retryDelay / 1000}s`;
      
      logger.error('❌ Hedge retry failed with error', {
        primaryPositionId: attempt.primaryPositionId,
        attemptCount: attempt.attemptCount,
        mode: mode,
        error: error instanceof Error ? error.message : 'Unknown error',
        nextRetryIn: nextRetryIn
      });
    }
  }

  /**
   * Get hedge size based on position type
   */
  private getHedgeSize(positionType: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP'): number {
    switch (positionType) {
      case 'ANCHOR': return 0.30; // 30%
      case 'OPPORTUNITY': return 0.30; // 30%
      case 'SCALP': return 0.10; // 10%
      default: return 0.30;
    }
  }

  /**
   * Get hedge leverage based on position type
   */
  private getHedgeLeverage(positionType: 'ANCHOR' | 'OPPORTUNITY' | 'SCALP'): number {
    switch (positionType) {
      case 'ANCHOR': return 25; // 25x
      case 'OPPORTUNITY': return 25; // 25x
      case 'SCALP': return 25; // 25x
      default: return 25;
    }
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): {
    isMonitoring: boolean;
    failedAttempts: number;
    verifications: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      failedAttempts: this.failedHedgeAttempts.size,
      verifications: this.hedgeVerifications.size
    };
  }

  /**
   * Get failed hedge attempts
   */
  getFailedHedgeAttempts(): HedgeAttempt[] {
    return Array.from(this.failedHedgeAttempts.values());
  }

  /**
   * Get hedge verifications
   */
  getHedgeVerifications(): HedgeVerification[] {
    return Array.from(this.hedgeVerifications.values());
  }

  /**
   * Clean up hedge attempts for closed positions
   */
  async cleanupClosedPositions(): Promise<void> {
    try {
      const openPositions = await this.binanceService.getOpenPositions();
      const openPositionIds = new Set(openPositions.map(pos => pos.id));
      
      // Remove attempts for positions that are no longer open
      for (const [key, attempt] of this.failedHedgeAttempts.entries()) {
        if (!openPositionIds.has(attempt.primaryPositionId)) {
          this.failedHedgeAttempts.delete(key);
          this.hedgeVerifications.delete(attempt.primaryPositionId);
          
          logger.info('🧹 Cleaned up hedge attempt for closed position', {
            primaryPositionId: attempt.primaryPositionId,
            primaryPositionType: attempt.primaryPositionType,
            finalAttemptCount: attempt.attemptCount,
            reason: 'Primary position closed'
          });
        }
      }
    } catch (error) {
      logger.error('Failed to cleanup closed positions', error);
    }
  }
}
