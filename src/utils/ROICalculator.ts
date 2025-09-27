import { Position } from '../types';
import { logger } from './logger';

export interface ROICalculationResult {
  currentROI: number;
  targetPrice: number;
  requiredPriceChange: number;
  requiredPriceChangePercent: number;
  currentPnL: number;
  targetPnL: number;
}

export class ROICalculator {
  /**
   * Calculate current ROI for a position
   */
  static calculateCurrentROI(position: Position, currentPrice: number): number {
    const positionSize = position.size || position.quantity;
    const leverage = position.leverage;
    
    // Calculate initial investment (margin required)
    const initialInvestment = (positionSize * position.entryPrice) / leverage;
    
    // Calculate current PnL
    let priceChange;
    if (position.side === 'LONG') {
      priceChange = currentPrice - position.entryPrice;
    } else {
      priceChange = position.entryPrice - currentPrice;
    }
    
    const currentPnL = positionSize * priceChange * leverage;
    
    // Calculate ROI percentage
    const roi = (currentPnL / initialInvestment) * 100;
    
    return roi;
  }

  /**
   * Calculate target price needed to achieve desired ROI
   */
  static calculateTargetPrice(position: Position, roiTarget: number): number {
    const positionSize = position.size || position.quantity;
    const leverage = position.leverage;
    
    // Calculate initial investment (margin required)
    const initialInvestment = (positionSize * position.entryPrice) / leverage;
    
    // Calculate target PnL
    const targetPnL = initialInvestment * (roiTarget / 100);
    
    // Calculate required price change
    const requiredPriceChange = targetPnL / (positionSize * leverage);
    
    // Calculate target price
    let targetPrice;
    if (position.side === 'LONG') {
      targetPrice = position.entryPrice + requiredPriceChange;
    } else {
      targetPrice = position.entryPrice - requiredPriceChange;
    }
    
    return targetPrice;
  }

  /**
   * Get comprehensive ROI calculation result
   */
  static getROICalculation(position: Position, currentPrice: number, roiTarget: number): ROICalculationResult {
    const currentROI = this.calculateCurrentROI(position, currentPrice);
    const targetPrice = this.calculateTargetPrice(position, roiTarget);
    
    const positionSize = position.size || position.quantity;
    const leverage = position.leverage;
    const initialInvestment = (positionSize * position.entryPrice) / leverage;
    
    // Calculate current PnL
    let priceChange;
    if (position.side === 'LONG') {
      priceChange = currentPrice - position.entryPrice;
    } else {
      priceChange = position.entryPrice - currentPrice;
    }
    const currentPnL = positionSize * priceChange * leverage;
    const targetPnL = initialInvestment * (roiTarget / 100);
    
    // Calculate required price change
    const requiredPriceChange = Math.abs(targetPrice - position.entryPrice);
    const requiredPriceChangePercent = (requiredPriceChange / position.entryPrice) * 100;
    
    return {
      currentROI,
      targetPrice,
      requiredPriceChange,
      requiredPriceChangePercent,
      currentPnL,
      targetPnL
    };
  }

  /**
   * Check if position should exit based on ROI target
   */
  static shouldExitOnROI(position: Position, currentPrice: number, roiTarget: number): boolean {
    const currentROI = this.calculateCurrentROI(position, currentPrice);
    const shouldExit = currentROI >= roiTarget;
    
    if (shouldExit) {
      logger.info('🎯 ROI Target Reached - Position Ready for Exit', {
        positionId: position.id,
        positionType: position.type,
        side: position.side,
        entryPrice: position.entryPrice,
        currentPrice: currentPrice,
        currentROI: currentROI.toFixed(2) + '%',
        roiTarget: roiTarget + '%',
        leverage: position.leverage,
        positionSize: position.size || position.quantity
      });
    }
    
    return shouldExit;
  }

  /**
   * Get ROI-based take profit price for position
   */
  static getROITakeProfitPrice(position: Position, roiTarget: number): number {
    return this.calculateTargetPrice(position, roiTarget);
  }

  /**
   * Log detailed ROI analysis
   */
  static logROIAnalysis(position: Position, currentPrice: number, roiTarget: number): void {
    const result = this.getROICalculation(position, currentPrice, roiTarget);
    
    logger.info('📊 ROI Analysis', {
      positionId: position.id,
      positionType: position.type,
      side: position.side,
      entryPrice: position.entryPrice,
      currentPrice: currentPrice,
      currentROI: result.currentROI.toFixed(2) + '%',
      targetROI: roiTarget + '%',
      targetPrice: result.targetPrice.toFixed(4),
      requiredPriceChange: result.requiredPriceChange.toFixed(4),
      requiredPriceChangePercent: result.requiredPriceChangePercent.toFixed(2) + '%',
      currentPnL: result.currentPnL.toFixed(2),
      targetPnL: result.targetPnL.toFixed(2),
      leverage: position.leverage,
      positionSize: position.size || position.quantity
    });
  }
}