/**
 * ADA/USDT Pair Configuration
 * Complete configuration for ADA trading pair
 */

import { PairConfig } from '../PairConfig';

export const adaConfig: PairConfig = {
  // Basic pair information
  symbol: 'ADAUSDT',
  name: 'Cardano',
  enabled: process.env.ADA_ENABLED !== 'false',
  
  // Trading configuration
  baseBalance: parseFloat(process.env.BASE_BALANCE || '1000'),
  
  // Position sizing
  positionSizing: {
    anchorPositionSize: parseFloat(process.env.ADA_ANCHOR_POSITION_SIZE || process.env.BASE_ANCHOR_SIZE || '0.20'),
    anchorHedgeSize: parseFloat(process.env.ADA_ANCHOR_HEDGE_SIZE || process.env.BASE_HEDGE_SIZE || '0.30'),
    opportunityPositionSize: parseFloat(process.env.ADA_OPPORTUNITY_POSITION_SIZE || process.env.BASE_OPPORTUNITY_SIZE || '0.20'),
    opportunityHedgeSize: parseFloat(process.env.ADA_OPPORTUNITY_HEDGE_SIZE || process.env.BASE_HEDGE_SIZE || '0.30'),
    scalpPositionSize: parseFloat(process.env.ADA_SCALP_POSITION_SIZE || process.env.BASE_SCALP_SIZE || '0.10'),
    scalpHedgeSize: parseFloat(process.env.ADA_SCALP_HEDGE_SIZE || process.env.BASE_SCALP_HEDGE_SIZE || '0.10'),
    maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.25'),
  },
  
  // Leverage settings (pair-specific overrides global defaults)
  leverageSettings: {
    anchorLeverage: parseInt(process.env.ADA_ANCHOR_LEVERAGE || process.env.ANCHOR_LEVERAGE || '10'),
    hedgeLeverage: parseInt(process.env.ADA_HEDGE_LEVERAGE || process.env.HEDGE_LEVERAGE || '15'),
    opportunityLeverage: parseInt(process.env.ADA_OPPORTUNITY_LEVERAGE || process.env.OPPORTUNITY_LEVERAGE || '10'),
    scalpLeverage: parseInt(process.env.ADA_SCALP_LEVERAGE || process.env.SCALP_LEVERAGE || '15'),
    scalpHedgeLeverage: parseInt(process.env.ADA_SCALP_HEDGE_LEVERAGE || process.env.SCALP_HEDGE_LEVERAGE || '15'),
    emergencyHedgeLeverage: parseInt(process.env.ADA_EMERGENCY_HEDGE_LEVERAGE || process.env.EMERGENCY_HEDGE_LEVERAGE || '20'),
  },
  
  // Technical analysis configuration (pair-specific overrides global defaults)
  technicalConfig: {
    rsiPeriod: parseInt(process.env.ADA_RSI_PERIOD || process.env.RSI_PERIOD || '14'),
    emaFast: parseInt(process.env.ADA_EMA_FAST || process.env.EMA_FAST || '9'),
    emaSlow: parseInt(process.env.ADA_EMA_SLOW || process.env.EMA_SLOW || '18'),
    volumePeriod: parseInt(process.env.ADA_VOLUME_PERIOD || process.env.VOLUME_PERIOD || '20'),
    volumeMultiplier: parseFloat(process.env.ADA_VOLUME_MULTIPLIER || process.env.VOLUME_MULTIPLIER || '1.2'),
    
    // High-Frequency Trading Configuration for ADA (0.6% profit targets)
    stochasticRSI: {
      rsiPeriod: parseInt(process.env.ADA_STOCH_RSI_PERIOD || process.env.STOCH_RSI_PERIOD || '14'),
      stochasticPeriod: parseInt(process.env.ADA_STOCH_PERIOD || process.env.STOCH_PERIOD || '14'),
      kPeriod: parseInt(process.env.ADA_STOCH_K_PERIOD || process.env.STOCH_K_PERIOD || '3'),
      dPeriod: parseInt(process.env.ADA_STOCH_D_PERIOD || process.env.STOCH_D_PERIOD || '3')
    },
    bollingerBands: {
      period: parseInt(process.env.ADA_BB_PERIOD || process.env.BB_PERIOD || '20'),
      stdDev: parseFloat(process.env.ADA_BB_STDDEV || process.env.BB_STDDEV || '2')
    },
    atr: {
      period: parseInt(process.env.ADA_ATR_PERIOD || process.env.ATR_PERIOD || '14')
    },
    mfi: {
      period: parseInt(process.env.ADA_MFI_PERIOD || process.env.MFI_PERIOD || '14')
    },
    macd: {
      fastPeriod: parseInt(process.env.ADA_MACD_FAST || process.env.MACD_FAST || '12'),
      slowPeriod: parseInt(process.env.ADA_MACD_SLOW || process.env.MACD_SLOW || '26'),
      signalPeriod: parseInt(process.env.ADA_MACD_SIGNAL || process.env.MACD_SIGNAL || '9')
    },
    awesomeOscillator: {
      fastPeriod: parseInt(process.env.ADA_AO_FAST || process.env.AO_FAST || '5'),
      slowPeriod: parseInt(process.env.ADA_AO_SLOW || process.env.AO_SLOW || '34')
    },
    trix: {
      period: parseInt(process.env.ADA_TRIX_PERIOD || process.env.TRIX_PERIOD || '14')
    },
    psar: {
      step: parseFloat(process.env.ADA_PSAR_STEP || process.env.PSAR_STEP || '0.02'),
      maximum: parseFloat(process.env.ADA_PSAR_MAX || process.env.PSAR_MAX || '0.2')
    }
  },
  
  // Support/Resistance levels
  supportResistanceLevels: {
    resistance1: parseFloat(process.env.ADA_RESISTANCE_1 || '0.8673'),
    resistance2: parseFloat(process.env.ADA_RESISTANCE_2 || '0.8816'),
    resistance3: parseFloat(process.env.ADA_RESISTANCE_3 || '0.8837'),
    support1: parseFloat(process.env.ADA_SUPPORT_1 || '0.8602'),
    support2: parseFloat(process.env.ADA_SUPPORT_2 || '0.8598'),
    support3: parseFloat(process.env.ADA_SUPPORT_3 || '0.8389'),
    liquidationStop: 0,
  },
  
  // Take profit percentages (pair-specific overrides global defaults)
  takeProfitPercentages: {
    anchor: parseFloat(process.env.ADA_ANCHOR_TP_PERCENT || process.env.ANCHOR_TP_PERCENT || '2.0'),
    opportunity: parseFloat(process.env.ADA_OPPORTUNITY_TP_PERCENT || process.env.OPPORTUNITY_TP_PERCENT || '1.5'),
    scalp: parseFloat(process.env.ADA_SCALP_TP_PERCENT || process.env.SCALP_TP_PERCENT || '0.5'),
  },
  
  // Comprehensive levels configuration
  comprehensiveLevels: {
    source: 'csv',
    filePath: 'docs/ADAUSD_сheat-sheet-09_08_2025.csv',
  },
  
  // Dynamic levels configuration (pair-specific overrides global defaults)
  dynamicLevels: {
    enabled: process.env.ADA_USE_DYNAMIC_LEVELS !== undefined 
      ? process.env.ADA_USE_DYNAMIC_LEVELS === 'true'
      : process.env.USE_DYNAMIC_LEVELS === 'true',
    learningPeriod: parseInt(process.env.ADA_LEARNING_PERIOD || process.env.LEARNING_PERIOD || '180'), // days
    timeframeWeights: {
      '4H': parseFloat(process.env.ADA_4H_WEIGHT || process.env.FOUR_HOUR_WEIGHT || '1.0'),
      '1H': parseFloat(process.env.ADA_1H_WEIGHT || process.env.ONE_HOUR_WEIGHT || '0.7'),
      '15M': parseFloat(process.env.ADA_15M_WEIGHT || process.env.FIFTEEN_MIN_WEIGHT || '0.4'),
    },
  },
  
  // Pair-specific settings
  settings: {
    minOrderSize: 10,        // $10 minimum order
    pricePrecision: 4,       // 4 decimal places
    quantityPrecision: 0,    // Whole numbers for ADA
    tickSize: 0.0001,        // $0.0001 minimum price increment
  },
};

export default adaConfig;
