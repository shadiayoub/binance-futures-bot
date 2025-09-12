/**
 * Pair Configuration Interface
 * Defines the structure for trading pair configurations
 */

import { 
  PositionSizing, 
  LeverageSettings, 
  TechnicalConfig, 
  SupportResistanceLevels 
} from '../types';

export interface PairConfig {
  // Basic pair information
  symbol: string;
  name: string;
  enabled: boolean;
  
  // Trading configuration
  baseBalance: number;
  positionSizing: PositionSizing;
  leverageSettings: LeverageSettings;
  technicalConfig: TechnicalConfig;
  supportResistanceLevels: SupportResistanceLevels;
  
  // Take profit percentages
  takeProfitPercentages: {
    anchor: number;      // e.g., 2.0 for 2%
    opportunity: number; // e.g., 1.5 for 1.5%
    scalp: number;       // e.g., 0.5 for 0.5%
  };
  
  // Comprehensive levels configuration
  comprehensiveLevels: {
    source: 'csv' | 'hardcoded' | 'api';
    filePath?: string;   // Path to CSV file if source is 'csv'
    levels?: Array<{
      price: number;
      description: string;
      type: 'RESISTANCE' | 'SUPPORT';
      importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
      zone: string;
    }>;
  };
  
  // Dynamic levels configuration
  dynamicLevels: {
    enabled: boolean;
    learningPeriod: number; // Days of historical data to learn from
    timeframeWeights: {
      '4H': number;
      '1H': number;
      '15M': number;
    };
  };
  
  // Pair-specific settings
  settings: {
    minOrderSize: number;     // Minimum order size for the pair
    pricePrecision: number;   // Price decimal precision
    quantityPrecision: number; // Quantity decimal precision
    tickSize: number;         // Minimum price increment
  };
}

export interface MultiPairConfig {
  // Global settings
  global: {
    apiKey: string;
    secretKey: string;
    testnet: boolean;
    logLevel: string;
    logFile: string;
  };
  
  // Active pairs
  activePairs: string[]; // e.g., ['ADAUSDT', 'ETHUSDT']
  
  // Pair configurations
  pairs: Map<string, PairConfig>;
  
  // System settings
  system: {
    priceUpdateInterval: number; // seconds
    historical4hDays: number;
    historical1hDays: number;
    historical15mDays: number;
  };
}

export default PairConfig;
