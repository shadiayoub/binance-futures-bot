/**
 * Pair Registry
 * Central registry for all available trading pairs
 */

import { PairConfig } from '../PairConfig';
import { adaConfig } from './ada';
import { ethConfig } from './eth';
import { bnbConfig } from './bnb';
import { btcConfig } from './btc';

// Registry of all available pairs
export const PAIR_REGISTRY: Map<string, PairConfig> = new Map([
  ['ADAUSDT', adaConfig],
  ['ETHUSDT', ethConfig],
  ['BNBUSDT', bnbConfig],
  ['BTCUSDT', btcConfig],
  // Future pairs can be added here:
  // ['SOLUSDT', solConfig],
]);

/**
 * Get pair configuration by symbol
 */
export function getPairConfig(symbol: string): PairConfig | null {
  return PAIR_REGISTRY.get(symbol) || null;
}

/**
 * Get all available pair symbols
 */
export function getAvailablePairs(): string[] {
  return Array.from(PAIR_REGISTRY.keys());
}

/**
 * Get all enabled pair symbols
 */
export function getEnabledPairs(): string[] {
  return Array.from(PAIR_REGISTRY.values())
    .filter(config => config.enabled)
    .map(config => config.symbol);
}

/**
 * Validate pair configuration
 */
export function validatePairConfig(config: PairConfig): string[] {
  const errors: string[] = [];
  
  if (!config.symbol) {
    errors.push('Symbol is required');
  }
  
  if (!config.name) {
    errors.push('Name is required');
  }
  
  if (config.baseBalance <= 0) {
    errors.push('Base balance must be greater than 0');
  }
  
  // Validate position sizing adds up to 100%
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
  
  return errors;
}

/**
 * Register a new pair configuration
 */
export function registerPair(config: PairConfig): void {
  const errors = validatePairConfig(config);
  if (errors.length > 0) {
    throw new Error(`Invalid pair configuration for ${config.symbol}: ${errors.join(', ')}`);
  }
  
  PAIR_REGISTRY.set(config.symbol, config);
}

export default PAIR_REGISTRY;
