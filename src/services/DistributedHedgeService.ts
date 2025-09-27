import { 
  Position, 
  TradingSignal, 
  PositionSizing, 
  LeverageSettings 
} from '../types';
import { BinanceService } from './BinanceService';
import { logger } from '../utils/logger';

export interface HedgeApiConfig {
  apiKey: string;
  secretKey: string;
  testnet: boolean;
}

export interface PositionSyncData {
  symbol: string;
  primaryPosition: Position | null;
  hedgePosition: Position | null;
  lastSync: Date;
  syncStatus: 'SYNCED' | 'PENDING' | 'ERROR';
}

export class DistributedHedgeService {
  private primaryBinanceService: BinanceService;
  private hedgeBinanceService: BinanceService | null = null;
  private positionSyncData: Map<string, PositionSyncData> = new Map();
  private useDistributedHedging: boolean;

  constructor(
    primaryBinanceService: BinanceService,
    hedgeApiConfig?: HedgeApiConfig
  ) {
    this.primaryBinanceService = primaryBinanceService;
    this.useDistributedHedging = process.env.USE_DISTRIBUTED_HEDGING === 'true' && !!hedgeApiConfig;

    if (this.useDistributedHedging && hedgeApiConfig) {
      this.initializeHedgeService(hedgeApiConfig);
    }

    logger.info('🔀 Distributed Hedge Service Initialized', {
      useDistributedHedging: this.useDistributedHedging,
      hasHedgeService: !!this.hedgeBinanceService,
      hedgeApiKey: hedgeApiConfig?.apiKey ? '***' + hedgeApiConfig.apiKey.slice(-4) : 'none'
    });
  }

  /**
   * Initialize hedge service with secondary API key
   */
  private initializeHedgeService(hedgeApiConfig: HedgeApiConfig): void {
    try {
      // Create hedge service with same configuration as primary but different API keys
      const primaryConfig = this.primaryBinanceService.getConfig();
      
      this.hedgeBinanceService = new BinanceService({
        ...primaryConfig,
        apiKey: hedgeApiConfig.apiKey,
        secretKey: hedgeApiConfig.secretKey,
        testnet: hedgeApiConfig.testnet
      });

      logger.info('✅ Hedge Service Initialized with Secondary API Key', {
        primaryApiKey: '***' + primaryConfig.apiKey.slice(-4),
        hedgeApiKey: '***' + hedgeApiConfig.apiKey.slice(-4),
        testnet: hedgeApiConfig.testnet
      });
    } catch (error) {
      logger.error('❌ Failed to initialize hedge service', error);
      this.useDistributedHedging = false;
    }
  }

  /**
   * Open primary position using primary API key
   */
  async openPrimaryPosition(signal: TradingSignal, positionSizing: PositionSizing, leverageSettings: LeverageSettings): Promise<Position | null> {
    try {
      logger.info('🎯 Opening Primary Position with Primary API Key', {
        signal: signal.type,
        position: signal.position,
        price: signal.price,
        apiKey: '***' + this.primaryBinanceService.getConfig().apiKey.slice(-4)
      });

      const position = await this.primaryBinanceService.openPosition(
        signal.position,
        this.calculatePositionSize(signal, positionSizing),
        this.calculateLeverage(signal, leverageSettings)
      );

      if (position) {
        // Update sync data
        this.updatePositionSyncData(signal.symbol || 'UNKNOWN', position, null);
        
        logger.info('✅ Primary Position Opened Successfully', {
          positionId: position.id,
          side: position.side,
          size: position.size,
          leverage: position.leverage,
          apiKey: '***' + this.primaryBinanceService.getConfig().apiKey.slice(-4)
        });
      }

      return position;
    } catch (error) {
      logger.error('❌ Failed to open primary position', error);
      return null;
    }
  }

  /**
   * Open hedge position using hedge API key (if distributed) or primary API key
   */
  async openHedgePosition(signal: TradingSignal, positionSizing: PositionSizing, leverageSettings: LeverageSettings): Promise<Position | null> {
    try {
      const binanceService = this.useDistributedHedging && this.hedgeBinanceService 
        ? this.hedgeBinanceService 
        : this.primaryBinanceService;

      const apiKeyType = this.useDistributedHedging && this.hedgeBinanceService ? 'Hedge' : 'Primary';

      logger.info('🛡️ Opening Hedge Position with ' + apiKeyType + ' API Key', {
        signal: signal.type,
        position: signal.position,
        price: signal.price,
        apiKey: '***' + binanceService.getConfig().apiKey.slice(-4),
        distributedHedging: this.useDistributedHedging
      });

      const position = await binanceService.openPosition(
        signal.position,
        this.calculatePositionSize(signal, positionSizing),
        this.calculateLeverage(signal, leverageSettings)
      );

      if (position) {
        // Update sync data
        this.updatePositionSyncData(signal.symbol || 'UNKNOWN', null, position);
        
        logger.info('✅ Hedge Position Opened Successfully', {
          positionId: position.id,
          side: position.side,
          size: position.size,
          leverage: position.leverage,
          apiKey: '***' + binanceService.getConfig().apiKey.slice(-4),
          distributedHedging: this.useDistributedHedging
        });
      }

      return position;
    } catch (error) {
      logger.error('❌ Failed to open hedge position', error);
      return null;
    }
  }

  /**
   * Get all positions from both API keys and sync them
   */
  async getAllPositions(): Promise<Position[]> {
    try {
      const primaryPositions = await this.primaryBinanceService.getCurrentPositions();
      let hedgePositions: Position[] = [];

      if (this.useDistributedHedging && this.hedgeBinanceService) {
        hedgePositions = await this.hedgeBinanceService.getCurrentPositions();
      }

      // Sync positions between API keys
      await this.syncPositions(primaryPositions, hedgePositions);

      // Combine all positions
      const allPositions = [...primaryPositions, ...hedgePositions];

      logger.info('🔄 Position Sync Complete', {
        primaryPositions: primaryPositions.length,
        hedgePositions: hedgePositions.length,
        totalPositions: allPositions.length,
        distributedHedging: this.useDistributedHedging
      });

      return allPositions;
    } catch (error) {
      logger.error('❌ Failed to get all positions', error);
      return [];
    }
  }

  /**
   * Sync positions between primary and hedge API keys
   */
  private async syncPositions(primaryPositions: Position[], hedgePositions: Position[]): Promise<void> {
    try {
      // Create position sync file for cross-API communication
      const syncData = {
        timestamp: new Date().toISOString(),
        primaryPositions: primaryPositions.map(pos => ({
          id: pos.id,
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          leverage: pos.leverage,
          entryPrice: pos.entryPrice,
          type: pos.type,
          status: pos.status,
          apiKey: 'primary'
        })),
        hedgePositions: hedgePositions.map(pos => ({
          id: pos.id,
          symbol: pos.symbol,
          side: pos.side,
          size: pos.size,
          leverage: pos.leverage,
          entryPrice: pos.entryPrice,
          type: pos.type,
          status: pos.status,
          apiKey: 'hedge'
        }))
      };

      // Write sync data to local file for cross-API communication
      const fs = require('fs');
      const path = require('path');
      const syncFilePath = path.join(process.cwd(), 'position-sync.json');
      
      fs.writeFileSync(syncFilePath, JSON.stringify(syncData, null, 2));

      logger.info('📄 Position Sync Data Written', {
        syncFilePath,
        primaryPositions: primaryPositions.length,
        hedgePositions: hedgePositions.length,
        distributedHedging: this.useDistributedHedging
      });
    } catch (error) {
      logger.error('❌ Failed to sync positions', error);
    }
  }

  /**
   * Update position sync data
   */
  private updatePositionSyncData(symbol: string, primaryPosition: Position | null, hedgePosition: Position | null): void {
    const existingData = this.positionSyncData.get(symbol) || {
      symbol,
      primaryPosition: null,
      hedgePosition: null,
      lastSync: new Date(),
      syncStatus: 'SYNCED' as const
    };

    if (primaryPosition) {
      existingData.primaryPosition = primaryPosition;
    }
    if (hedgePosition) {
      existingData.hedgePosition = hedgePosition;
    }

    existingData.lastSync = new Date();
    existingData.syncStatus = 'SYNCED';

    this.positionSyncData.set(symbol, existingData);
  }

  /**
   * Calculate position size based on signal type
   */
  private calculatePositionSize(signal: TradingSignal, positionSizing: PositionSizing): number {
    // Determine position size based on signal type
    if (signal.reason && signal.reason.includes('HF')) {
      // HF positions use configurable HF position size
      return positionSizing.hfPositionSize;
    } else if (signal.reason && signal.reason.includes('scalp')) {
      return positionSizing.scalpPositionSize;
    } else if (signal.reason && signal.reason.includes('Peak')) {
      return positionSizing.opportunityPositionSize;
    } else {
      // Default to anchor position size for other signals
      return positionSizing.anchorPositionSize;
    }
  }

  /**
   * Calculate leverage based on signal type
   */
  private calculateLeverage(signal: TradingSignal, leverageSettings: LeverageSettings): number {
    // Determine leverage based on signal type
    if (signal.reason && signal.reason.includes('HF')) {
      // HF positions use anchor leverage (20x from config)
      return leverageSettings.anchorLeverage;
    } else if (signal.reason && signal.reason.includes('scalp')) {
      return leverageSettings.scalpLeverage;
    } else if (signal.reason && signal.reason.includes('Peak')) {
      return leverageSettings.opportunityLeverage;
    } else {
      // Default to anchor leverage for other signals
      return leverageSettings.anchorLeverage;
    }
  }

  /**
   * Check if distributed hedging is enabled
   */
  isDistributedHedgingEnabled(): boolean {
    return this.useDistributedHedging;
  }

  /**
   * Get position sync data for a symbol
   */
  getPositionSyncData(symbol: string): PositionSyncData | null {
    return this.positionSyncData.get(symbol) || null;
  }

  /**
   * Read position sync data from JSON file
   */
  readPositionSyncFile(): any | null {
    try {
      const fs = require('fs');
      const path = require('path');
      const syncFilePath = path.join(process.cwd(), 'position-sync.json');
      
      if (fs.existsSync(syncFilePath)) {
        const data = fs.readFileSync(syncFilePath, 'utf8');
        const syncData = JSON.parse(data);
        
        logger.info('📖 Position Sync Data Read from File', {
          syncFilePath,
          timestamp: syncData.timestamp,
          primaryPositions: syncData.primaryPositions?.length || 0,
          hedgePositions: syncData.hedgePositions?.length || 0
        });
        
        return syncData;
      } else {
        logger.info('📄 No position sync file found', { syncFilePath });
        return null;
      }
    } catch (error) {
      logger.error('❌ Failed to read position sync file', error);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.primaryBinanceService.cleanup();
    if (this.hedgeBinanceService) {
      this.hedgeBinanceService.cleanup();
    }
  }
}
