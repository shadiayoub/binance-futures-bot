import dotenv from 'dotenv';
import { 
  TradingConfig, 
  PositionSizing, 
  LeverageSettings, 
  TechnicalConfig, 
  SupportResistanceLevels 
} from '../types';
import { BOT_VERSION, VERSION_INFO } from './version';
import { MultiPairConfig, PairConfig } from './PairConfig';
import { getPairConfig, getAvailablePairs, getEnabledPairs } from './pairs';
import { logger } from '../utils/logger';

dotenv.config();

export const tradingConfig: TradingConfig = {
  apiKey: process.env.BINANCE_API_KEY || '',
  secretKey: process.env.BINANCE_SECRET_KEY || '',
  testnet: process.env.BINANCE_TESTNET === 'true',
  tradingPair: process.env.TRADING_PAIR || 'ADAUSDT',
  baseBalance: parseFloat(process.env.BASE_BALANCE || '1000'),
  riskPerTrade: 0, // Not applicable in hedge system - guaranteed profit
  historical4hDays: parseInt(process.env.HISTORICAL_4H_DAYS || '180'),
  historical1hDays: parseInt(process.env.HISTORICAL_1H_DAYS || '7'),
  historical15mDays: parseInt(process.env.HISTORICAL_15M_DAYS || '1'),
  priceUpdateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '20'), // seconds
};

export const positionSizing: PositionSizing = {
  anchorPositionSize: parseFloat(process.env.ANCHOR_POSITION_SIZE || '0.20'),
  anchorHedgeSize: parseFloat(process.env.ANCHOR_HEDGE_SIZE || '0.30'),
  opportunityPositionSize: parseFloat(process.env.OPPORTUNITY_POSITION_SIZE || '0.20'),
  opportunityHedgeSize: parseFloat(process.env.OPPORTUNITY_HEDGE_SIZE || '0.30'),
  scalpPositionSize: parseFloat(process.env.SCALP_POSITION_SIZE || '0.10'),
  scalpHedgeSize: parseFloat(process.env.SCALP_HEDGE_SIZE || '0.10'),
  hfPositionSize: parseFloat(process.env.HF_POSITION_SIZE || '0.15'), // 15% HF position size
  maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.25'), // 25% max position size
};

export const leverageSettings: LeverageSettings = {
  anchorLeverage: parseInt(process.env.ANCHOR_LEVERAGE || '20'), // Default to 20x if not set
  hedgeLeverage: parseInt(process.env.HEDGE_LEVERAGE || '25'), // Default to 25x if not set
  opportunityLeverage: parseInt(process.env.OPPORTUNITY_LEVERAGE || '20'), // Default to 20x if not set
  scalpLeverage: parseInt(process.env.SCALP_LEVERAGE || '15'), // Default to 15x if not set
  scalpHedgeLeverage: parseInt(process.env.SCALP_HEDGE_LEVERAGE || '25'), // Default to 25x if not set
  emergencyHedgeLeverage: parseInt(process.env.EMERGENCY_HEDGE_LEVERAGE || '20'), // Default to 20x if not set
};

export const technicalConfig: TechnicalConfig = {
  rsiPeriod: parseInt(process.env.RSI_PERIOD || '14'),
  emaFast: parseInt(process.env.EMA_FAST || '9'),
  emaSlow: parseInt(process.env.EMA_SLOW || '18'),
  volumePeriod: parseInt(process.env.VOLUME_PERIOD || '20'),
  volumeMultiplier: parseFloat(process.env.VOLUME_MULTIPLIER || '0.1'), // Set to 0.1 to allow trading in very low-volume markets
  
  // High-Frequency Trading Configuration (0.6% profit targets)
  stochasticRSI: {
    rsiPeriod: parseInt(process.env.STOCH_RSI_PERIOD || '14'),
    stochasticPeriod: parseInt(process.env.STOCH_PERIOD || '14'),
    kPeriod: parseInt(process.env.STOCH_K_PERIOD || '3'),
    dPeriod: parseInt(process.env.STOCH_D_PERIOD || '3')
  },
  bollingerBands: {
    period: parseInt(process.env.BB_PERIOD || '20'),
    stdDev: parseFloat(process.env.BB_STDDEV || '2')
  },
  atr: {
    period: parseInt(process.env.ATR_PERIOD || '14')
  },
  mfi: {
    period: parseInt(process.env.MFI_PERIOD || '14')
  },
  macd: {
    fastPeriod: parseInt(process.env.MACD_FAST || '12'),
    slowPeriod: parseInt(process.env.MACD_SLOW || '26'),
    signalPeriod: parseInt(process.env.MACD_SIGNAL || '9')
  },
  awesomeOscillator: {
    fastPeriod: parseInt(process.env.AO_FAST || '5'),
    slowPeriod: parseInt(process.env.AO_SLOW || '34')
  },
  trix: {
    period: parseInt(process.env.TRIX_PERIOD || '14')
  },
  psar: {
    step: parseFloat(process.env.PSAR_STEP || '0.02'),
    maximum: parseFloat(process.env.PSAR_MAX || '0.2')
  }
};

export const supportResistanceLevels: SupportResistanceLevels = {
  resistance1: parseFloat(process.env.RESISTANCE_1 || '0.8620'),
  resistance2: parseFloat(process.env.RESISTANCE_2 || '0.8950'),
  resistance3: parseFloat(process.env.RESISTANCE_3 || '0.9200'),
  support1: parseFloat(process.env.SUPPORT_1 || '0.8230'),
  support2: parseFloat(process.env.SUPPORT_2 || '0.8100'),
  support3: parseFloat(process.env.SUPPORT_3 || '0.7800'),
  liquidationStop: 0, // Not needed - liquidation happens automatically
};

export const logConfig = {
  level: process.env.LOG_LEVEL || 'info',
  file: process.env.LOG_FILE || 'logs/trading-bot.log',
};

// Export version information
export { BOT_VERSION, VERSION_INFO };

// Multi-Pair Configuration System
export function createMultiPairConfig(): MultiPairConfig {
  const activePairs = (process.env.ACTIVE_PAIRS || 'ADAUSDT').split(',').map(p => p.trim());
  const pairs = new Map<string, PairConfig>();
  
  // Load configurations for active pairs
  for (const symbol of activePairs) {
    const pairConfig = getPairConfig(symbol);
    if (pairConfig) {
      pairs.set(symbol, pairConfig);
      logger.info(`Loaded configuration for ${symbol}`, {
        symbol,
        name: pairConfig.name,
        enabled: pairConfig.enabled
      });
    } else {
      logger.warn(`No configuration found for pair: ${symbol}`);
    }
  }
  
  return {
    global: {
      apiKey: process.env.BINANCE_API_KEY || '',
      secretKey: process.env.BINANCE_SECRET_KEY || '',
      testnet: process.env.BINANCE_TESTNET === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
      logFile: process.env.LOG_FILE || 'logs/trading-bot.log',
    },
    activePairs,
    pairs,
    system: {
      priceUpdateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '20'),
      historical4hDays: parseInt(process.env.HISTORICAL_4H_DAYS || '180'),
      historical1hDays: parseInt(process.env.HISTORICAL_1H_DAYS || '7'),
      historical15mDays: parseInt(process.env.HISTORICAL_15M_DAYS || '1'),
    }
  };
}

// Get current pair configuration (for backward compatibility)
export function getCurrentPairConfig(): PairConfig | null {
  const currentPair = process.env.TRADING_PAIR || 'ADAUSDT';
  return getPairConfig(currentPair);
}

// Export pair utilities
export { getPairConfig, getAvailablePairs, getEnabledPairs };

// Validation function
export function validateConfig(): void {
  const required = [
    'BINANCE_API_KEY',
    'BINANCE_SECRET_KEY',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  if (tradingConfig.baseBalance <= 0) {
    throw new Error('Base balance must be greater than 0');
  }

  // Risk per trade validation not needed in hedge system

  // Validate position sizing adds up to 100%
  const totalSize = positionSizing.anchorPositionSize + 
                   positionSizing.anchorHedgeSize + 
                   positionSizing.opportunityPositionSize + 
                   positionSizing.opportunityHedgeSize;
  
  if (Math.abs(totalSize - 1.0) > 0.01) {
    throw new Error('Position sizes must add up to 100%');
  }
}
