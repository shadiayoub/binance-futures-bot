export interface TradingConfig {
  apiKey: string;
  secretKey: string;
  testnet: boolean;
  tradingPair: string;
  baseBalance: number;
  riskPerTrade: number;
  historical4hDays: number;
  historical1hDays: number;
  historical15mDays: number;
  priceUpdateInterval: number; // seconds
}

export interface PositionSizing {
  anchorPositionSize: number;
  anchorHedgeSize: number;
  opportunityPositionSize: number;
  opportunityHedgeSize: number;
  scalpPositionSize: number;
  scalpHedgeSize: number;
  hfPositionSize: number; // High-Frequency position size as percentage of balance
  maxPositionSize: number; // Maximum position size as percentage of balance
}

export interface LeverageSettings {
  anchorLeverage: number;
  hedgeLeverage: number;
  opportunityLeverage: number;
  scalpLeverage: number;
  scalpHedgeLeverage: number;
  emergencyHedgeLeverage: number;
}

export interface TechnicalConfig {
  rsiPeriod: number;
  emaFast: number;
  emaSlow: number;
  volumePeriod: number;
  volumeMultiplier: number;
  
  // High-Frequency Trading Configuration
  stochasticRSI: {
    rsiPeriod: number;
    stochasticPeriod: number;
    kPeriod: number;
    dPeriod: number;
  };
  bollingerBands: {
    period: number;
    stdDev: number;
  };
  atr: {
    period: number;
  };
  mfi: {
    period: number;
  };
  macd: {
    fastPeriod: number;
    slowPeriod: number;
    signalPeriod: number;
  };
  awesomeOscillator: {
    fastPeriod: number;
    slowPeriod: number;
  };
  trix: {
    period: number;
  };
  psar: {
    step: number;
    maximum: number;
  };
}

export interface SupportResistanceLevels {
  resistance1: number;
  resistance2: number;
  resistance3: number;
  support1: number;
  support2: number;
  support3: number;
  liquidationStop: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  type: 'ANCHOR' | 'ANCHOR_HEDGE' | 'OPPORTUNITY' | 'OPPORTUNITY_HEDGE' | 'SCALP' | 'SCALP_HEDGE' | 'HF';
  size?: number; // Optional for backward compatibility
  quantity: number; // Required for position amount
  entryPrice: number;
  leverage: number;
  stopLoss?: number; // Optional
  takeProfit?: number;
  status: 'OPEN' | 'CLOSED' | 'LIQUIDATED';
  openTime?: Date; // Optional for backward compatibility
  closeTime?: Date;
  pnl?: number;
  liquidationPrice?: number; // Added for hedge monitoring
}

export interface MarketData {
  symbol: string;
  price: number;
  volume: number;
  timestamp: Date;
  timeframe: '1h' | '4h';
}

export interface TechnicalIndicators {
  rsi: number;
  emaFast: number;
  emaSlow: number;
  volumeSma: number;
  volumeRatio: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
  vwap: number;
  vwapDistance: number; // Distance from VWAP as percentage
  
  // High-Frequency Trading Indicators (0.6% profit targets)
  stochasticRSI: {
    k: number; // %K value
    d: number; // %D value
    isOversold: boolean;
    isOverbought: boolean;
  };
  bollingerBands: {
    upper: number;
    middle: number;
    lower: number;
    bandwidth: number; // Volatility measure
    isUpperTouch: boolean;
    isLowerTouch: boolean;
  };
  atr: number; // Average True Range
  mfi: number; // Money Flow Index
  macd: {
    macd: number;
    signal: number;
    histogram: number;
    isBullish: boolean;
    isBearish: boolean;
  };
  awesomeOscillator: number;
  trix: number;
  psar: number; // Parabolic SAR
}

export interface TradingSignal {
  type: 'ENTRY' | 'HEDGE' | 'EXIT' | 'RE_ENTRY';
  position: 'LONG' | 'SHORT';
  price: number;
  confidence: number;
  reason: string;
  timestamp: Date;
  symbol?: string; // Optional symbol for distributed hedging
}

export interface BotState {
  isRunning: boolean;
  currentPositions: Position[];
  totalBalance: number;
  availableBalance: number;
  dailyPnL: number;
  weeklyPnL: number;
  lastUpdate: Date;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: Date;
  data?: any;
}

// AI Integration Types
export interface AIConfig {
  deepSeekApiKey: string;
  deepSeekBaseUrl: string;
  enableSentimentAnalysis: boolean;
  enablePatternRecognition: boolean;
  enableMarketRegimeDetection: boolean;
  enableRiskAssessment: boolean;
  enableCorrelationAnalysis: boolean;
  sentimentAnalysisInterval: number; // minutes
  patternRecognitionInterval: number; // minutes
  marketRegimeInterval: number; // minutes
  riskAssessmentInterval: number; // minutes
  maxApiCallsPerHour: number;
  fallbackToTechnicalOnly: boolean;
}

export interface SentimentData {
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentScore: number; // -1 to 1
  confidence: number; // 0 to 1
  sources: {
    news: number;
    social: number;
    analyst: number;
  };
  keyEvents: string[];
  timestamp: Date;
}

export interface PatternData {
  patternType: 'SUPPORT' | 'RESISTANCE' | 'BREAKOUT' | 'REVERSAL' | 'CONTINUATION';
  patternName: string;
  confidence: number; // 0 to 1
  strength: number; // 0 to 1
  priceLevel: number;
  timeframe: string;
  description: string;
  timestamp: Date;
}

export interface MarketRegimeData {
  regime: 'TRENDING_BULL' | 'TRENDING_BEAR' | 'RANGING' | 'VOLATILE' | 'CALM';
  confidence: number; // 0 to 1
  volatility: number; // 0 to 1
  trendStrength: number; // 0 to 1
  marketPhase: 'ACCUMULATION' | 'MARKUP' | 'DISTRIBUTION' | 'MARKDOWN';
  expectedDuration: number; // hours
  timestamp: Date;
}

export interface RiskAssessmentData {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  riskScore: number; // 0 to 1
  factors: {
    volatility: number;
    correlation: number;
    liquidity: number;
    sentiment: number;
    technical: number;
  };
  recommendations: {
    positionSize: number; // multiplier (0.5 to 1.5)
    leverage: number; // multiplier (0.5 to 1.5)
    hedgeRatio: number; // multiplier (0.8 to 1.2)
    entryDelay: number; // minutes to wait
  };
  timestamp: Date;
}

export interface CorrelationData {
  asset: string;
  correlation: number; // -1 to 1
  significance: number; // 0 to 1
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  timestamp: Date;
}

export interface AIAnalysisResult {
  sentiment: SentimentData;
  patterns: PatternData[];
  marketRegime: MarketRegimeData;
  riskAssessment: RiskAssessmentData;
  correlations: CorrelationData[];
  overallConfidence: number; // 0 to 1
  tradingRecommendation: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'AVOID';
  timestamp: Date;
}

export interface EnhancedTradingSignal extends TradingSignal {
  aiConfidence: number; // 0 to 1
  aiFactors: {
    sentiment: number;
    pattern: number;
    regime: number;
    risk: number;
  };
  aiRecommendation: string;
  originalConfidence: number;
}
