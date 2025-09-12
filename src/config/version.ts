/**
 * Bot Version Configuration
 * This file contains the current version of the ADA Futures Trading Bot
 */

export const BOT_VERSION = '1.0.2';

export const VERSION_INFO = {
  version: BOT_VERSION,
  buildDate: new Date().toISOString(),
  features: [
    'Sequential Position Management',
    'Hybrid Timing System (2min heavy + 20s quick)',
    'Comprehensive 51-Level System',
    'Dynamic Level Learning',
    'Bidirectional Trading (LONG/SHORT)',
    'Liquidation-Based Hedging',
    'Price Peak Detection',
    'Target Return Exit',
    'Dynamic Balance System',
    'Real-time Price Updates (20s)',
    'Global Configuration System',
    'Multi-Pair Trading Support',
    'Emergency Hedge Leverage',
    'Centralized Environment Management',
    'Fixed Position Type Determination Logic'
  ],
  strategies: [
    'Anchor Strategy (Bidirectional)',
    'Peak Strategy (Market Reversal Detection)',
    'Scalp Strategy (High-Frequency Trading)'
  ],
  safety: [
    'Mathematical Profit Guarantee',
    'ISOLATED Margin Mode',
    'Automatic Error Recovery',
    'Comprehensive Logging'
  ]
};

export default BOT_VERSION;
