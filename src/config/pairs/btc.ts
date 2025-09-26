/**
 * BTC/USDT Pair Configuration
 * Complete configuration for BTC trading pair
 */

import { PairConfig } from '../PairConfig';

export const btcConfig: PairConfig = {
  // Basic pair information
  symbol: 'BTCUSDT',
  name: 'Bitcoin',
  enabled: process.env.BTC_ENABLED !== 'false',
  
  // Trading configuration
  baseBalance: parseFloat(process.env.BASE_BALANCE || '1000'),
  
  // Position sizing
  positionSizing: {
    anchorPositionSize: parseFloat(process.env.BTC_ANCHOR_POSITION_SIZE || process.env.BASE_ANCHOR_SIZE || '0.20'),
    anchorHedgeSize: parseFloat(process.env.BTC_ANCHOR_HEDGE_SIZE || process.env.BASE_HEDGE_SIZE || '0.30'),
    opportunityPositionSize: parseFloat(process.env.BTC_OPPORTUNITY_POSITION_SIZE || process.env.BASE_OPPORTUNITY_SIZE || '0.20'),
    opportunityHedgeSize: parseFloat(process.env.BTC_OPPORTUNITY_HEDGE_SIZE || process.env.BASE_HEDGE_SIZE || '0.30'),
    scalpPositionSize: parseFloat(process.env.BTC_SCALP_POSITION_SIZE || process.env.BASE_SCALP_SIZE || '0.10'),
    scalpHedgeSize: parseFloat(process.env.BTC_SCALP_HEDGE_SIZE || process.env.BASE_SCALP_HEDGE_SIZE || '0.10'),
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.25'),
  },
  
  // Leverage settings (pair-specific overrides global defaults)
  leverageSettings: {
    anchorLeverage: parseInt(process.env.BTC_ANCHOR_LEVERAGE || process.env.ANCHOR_LEVERAGE || '10'),
    hedgeLeverage: parseInt(process.env.BTC_HEDGE_LEVERAGE || process.env.HEDGE_LEVERAGE || '15'),
    opportunityLeverage: parseInt(process.env.BTC_OPPORTUNITY_LEVERAGE || process.env.OPPORTUNITY_LEVERAGE || '10'),
    scalpLeverage: parseInt(process.env.BTC_SCALP_LEVERAGE || process.env.SCALP_LEVERAGE || '15'),
    scalpHedgeLeverage: parseInt(process.env.BTC_SCALP_HEDGE_LEVERAGE || process.env.SCALP_HEDGE_LEVERAGE || '15'),
    emergencyHedgeLeverage: parseInt(process.env.BTC_EMERGENCY_HEDGE_LEVERAGE || process.env.EMERGENCY_HEDGE_LEVERAGE || '20'),
  },
  
  // Technical analysis configuration (pair-specific overrides global defaults)
  technicalConfig: {
    rsiPeriod: parseInt(process.env.BTC_RSI_PERIOD || process.env.RSI_PERIOD || '14'),
    emaFast: parseInt(process.env.BTC_EMA_FAST || process.env.EMA_FAST || '9'),
    emaSlow: parseInt(process.env.BTC_EMA_SLOW || process.env.EMA_SLOW || '18'),
    volumePeriod: parseInt(process.env.BTC_VOLUME_PERIOD || process.env.VOLUME_PERIOD || '20'),
    volumeMultiplier: parseFloat(process.env.BTC_VOLUME_MULTIPLIER || process.env.VOLUME_MULTIPLIER || '1.2'),
    
    // High-Frequency Trading Configuration for BTC (0.6% profit targets)
    stochasticRSI: {
      rsiPeriod: parseInt(process.env.BTC_STOCH_RSI_PERIOD || process.env.STOCH_RSI_PERIOD || '14'),
      stochasticPeriod: parseInt(process.env.BTC_STOCH_PERIOD || process.env.STOCH_PERIOD || '14'),
      kPeriod: parseInt(process.env.BTC_STOCH_K_PERIOD || process.env.STOCH_K_PERIOD || '3'),
      dPeriod: parseInt(process.env.BTC_STOCH_D_PERIOD || process.env.STOCH_D_PERIOD || '3')
    },
    bollingerBands: {
      period: parseInt(process.env.BTC_BB_PERIOD || process.env.BB_PERIOD || '20'),
      stdDev: parseFloat(process.env.BTC_BB_STDDEV || process.env.BB_STDDEV || '2')
    },
    atr: {
      period: parseInt(process.env.BTC_ATR_PERIOD || process.env.ATR_PERIOD || '14')
    },
    mfi: {
      period: parseInt(process.env.BTC_MFI_PERIOD || process.env.MFI_PERIOD || '14')
    },
    macd: {
      fastPeriod: parseInt(process.env.BTC_MACD_FAST || process.env.MACD_FAST || '12'),
      slowPeriod: parseInt(process.env.BTC_MACD_SLOW || process.env.MACD_SLOW || '26'),
      signalPeriod: parseInt(process.env.BTC_MACD_SIGNAL || process.env.MACD_SIGNAL || '9')
    },
    awesomeOscillator: {
      fastPeriod: parseInt(process.env.BTC_AO_FAST || process.env.AO_FAST || '5'),
      slowPeriod: parseInt(process.env.BTC_AO_SLOW || process.env.AO_SLOW || '34')
    },
    trix: {
      period: parseInt(process.env.BTC_TRIX_PERIOD || process.env.TRIX_PERIOD || '14')
    },
    psar: {
      step: parseFloat(process.env.BTC_PSAR_STEP || process.env.PSAR_STEP || '0.02'),
      maximum: parseFloat(process.env.BTC_PSAR_MAX || process.env.PSAR_MAX || '0.2')
    }
  },
  
  // Support/Resistance levels (from BTC cheatsheet)
  supportResistanceLevels: {
    resistance1: parseFloat(process.env.BTC_RESISTANCE_1 || '206452.75'),  // Price Crosses 18-40 Day Moving Average
    resistance2: parseFloat(process.env.BTC_RESISTANCE_2 || '144247.31'),  // 14 Day RSI at 80%
    resistance3: parseFloat(process.env.BTC_RESISTANCE_3 || '126956.24'),  // 14 Day RSI at 70%
    support1: parseFloat(process.env.BTC_SUPPORT_1 || '124198.52'),        // 52-Week High
    support2: parseFloat(process.env.BTC_SUPPORT_2 || '100000.00'),        // Historical Support
    support3: parseFloat(process.env.BTC_SUPPORT_3 || '50000.00'),         // Historical Support
    liquidationStop: 0,
  },
  
  // Take profit percentages (pair-specific overrides global defaults)
  takeProfitPercentages: {
    anchor: parseFloat(process.env.BTC_ANCHOR_TP_PERCENT || process.env.ANCHOR_TP_PERCENT || '2.0'),
    opportunity: parseFloat(process.env.BTC_OPPORTUNITY_TP_PERCENT || process.env.OPPORTUNITY_TP_PERCENT || '1.5'),
    scalp: parseFloat(process.env.BTC_SCALP_TP_PERCENT || process.env.SCALP_TP_PERCENT || '0.5'),
  },
  
  // Comprehensive levels configuration
  comprehensiveLevels: {
    source: 'csv',
    filePath: 'docs/BTCUSD_сheat-sheet-09_12_2025.csv',
  },
  
  // Dynamic levels configuration (pair-specific overrides global defaults)
  dynamicLevels: {
    enabled: process.env.BTC_USE_DYNAMIC_LEVELS !== undefined 
      ? process.env.BTC_USE_DYNAMIC_LEVELS === 'true'
      : process.env.USE_DYNAMIC_LEVELS === 'true',
    learningPeriod: parseInt(process.env.BTC_LEARNING_PERIOD || process.env.LEARNING_PERIOD || '180'), // days
    timeframeWeights: {
      '4H': parseFloat(process.env.BTC_4H_WEIGHT || process.env.FOUR_HOUR_WEIGHT || '1.0'),
      '1H': parseFloat(process.env.BTC_1H_WEIGHT || process.env.ONE_HOUR_WEIGHT || '0.7'),
      '15M': parseFloat(process.env.BTC_15M_WEIGHT || process.env.FIFTEEN_MIN_WEIGHT || '0.4'),
    },
  },
  
  // Pair-specific settings
  settings: {
    minOrderSize: 10,        // $10 minimum order
    pricePrecision: 2,       // 2 decimal places for BTC
    quantityPrecision: 5,    // 5 decimal places for BTC quantity (more precise)
    tickSize: 0.01,          // $0.01 minimum price increment
  },
};

export default btcConfig;
