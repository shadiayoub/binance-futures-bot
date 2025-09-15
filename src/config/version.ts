/**
 * Bot Version Configuration
 * This file contains the current version of the ADA Futures Trading Bot
 */

export const BOT_VERSION = '1.9.2';

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
    'Fixed Position Type Determination Logic',
    'Fixed Hardcoded Leverage Override Bug',
    'Hedge Exit Price Calculation System',
    'Mathematical Hedge Closure Logic',
    'Leverage-Adjusted Hedge Analysis',
    'Fee-Aware Hedge Closure Logic',
    'Corrected Binance Futures Fee Calculations',
    'Leverage-Adjusted Fee Calculations',
    'VWAP Integration for Market Sentiment Analysis',
    'Liquidity Zone Calculation for Zone-Based Hedging',
    'Buffer Zone Implementation for Strategic Hedge Placement',
    'VWAP Zone Activation Logic for Buffer Zone Signals',
    'Hedge Leverage Multiplier (Primary × 2) for Faster Profit Growth',
    'Single VWAP Signal Confirmation for Hedge Entry',
    'Distributed Hedging Strategy with Secondary API Key for Anti-Detection',
    'Conditional Scalp Activation Based on High-Volume Conditions',
    'Corrected Exit Logic - Primary TP Exits + Hedge System Risk Management',
    'Cross-Pair Primary Position Limiting System (Max 2 Primary Positions)',
    'Single API Key Mode for Simplified Hedge Management'
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
