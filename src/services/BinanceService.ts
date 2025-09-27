import Binance from 'binance-api-node';
import { 
  TradingConfig, 
  Position, 
  MarketData, 
  BotState 
} from '../types';
import { logger } from '../utils/logger';
// WebSocketService import removed to avoid circular dependency

export class BinanceService {
  private client: any;
  private config: TradingConfig;
  private timeOffset: number = 0;
  private cachedBalance: { total: number; available: number } | null = null;
  private lastBalanceUpdate: number = 0;
  private balanceCacheTimeout: number = 30000; // 30 seconds cache
  
  // Real-time price caching
  private cachedPrice: number | null = null;
  private lastPriceUpdate: number = 0;
  private priceCacheTimeout: number = 10000; // 10 seconds cache for price
  private priceUpdateInterval: NodeJS.Timeout | null = null;

  constructor(config: TradingConfig) {
    this.config = config;
    
    // Set price cache timeout based on config
    this.priceCacheTimeout = config.priceUpdateInterval * 1000; // Convert to milliseconds
    
    // Initialize client later in initialize() method after time sync
    this.client = null as any;
  }

  /**
   * Initialize the Binance connection and verify API access
   */
  async initialize(): Promise<void> {
    try {
      // First, get server time to sync
      await this.syncTime();
      
      // Create Binance client after time synchronization
      this.client = Binance({
        apiKey: this.config.apiKey,
        apiSecret: this.config.secretKey,
        getTime: () => {
          const currentTime = Date.now();
          const correctedTime = currentTime + this.timeOffset;
          logger.debug('Binance API timestamp', {
            currentTime,
            timeOffset: this.timeOffset,
            correctedTime,
            finalTimestamp: Math.floor(correctedTime)
          });
          return correctedTime;
        },
      });
      
      // Test API connection
      try {
        const accountInfo = await this.client.futuresAccountInfo();
        logger.info('Binance API connection established', { 
          accountType: accountInfo.accountType,
          canTrade: accountInfo.canTrade 
        });
      } catch (error: any) {
        if (error.code === -1021) {
          logger.warn('Binance API timestamp error during initialization, but continuing...', {
            error: error.message,
            code: error.code
          });
        } else {
          throw error;
        }
      }

      // Try to enable HEDGE mode for the entire account (optional)
      try {
        await this.setPositionSideMode(true); // true enables HEDGE mode
      } catch (error) {
        logger.warn('Could not set position side mode - continuing with positionSide parameter in orders');
      }

      // Then set margin mode to ISOLATED for the specific symbol
      try {
        await this.setMarginMode();
      } catch (error: any) {
        if (error.code === -1021) {
          logger.warn('Binance API timestamp error during margin mode setting, but continuing...', {
            error: error.message,
            code: error.code
          });
        } else {
          throw error;
        }
      }
      
      // Set leverage for the trading pair
      try {
        await this.setLeverage();
      } catch (error: any) {
        if (error.code === -1021) {
          logger.warn('Binance API timestamp error during leverage setting, but continuing...', {
            error: error.message,
            code: error.code
          });
        } else {
          throw error;
        }
      }
      
      // Start real-time price updates
      this.startRealTimePriceUpdates();
      
      logger.info('Binance service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Binance service', error);
      throw error;
    }
  }

  /**
   * Synchronize time with Binance servers
   */
  private async syncTime(): Promise<void> {
    try {
      // Perform multiple time sync attempts for better accuracy
      const attempts = 3;
      let totalOffset = 0;
      
      for (let i = 0; i < attempts; i++) {
        const startTime = Date.now();
        const response = await fetch('https://fapi.binance.com/fapi/v1/time');
        const endTime = Date.now();
        const networkDelay = endTime - startTime;
        
        const serverTimeData = await response.json() as { serverTime: number };
        const serverTime = serverTimeData.serverTime;
        
        // Account for network delay in the calculation
        const adjustedServerTime = serverTime + (networkDelay / 2);
        const localTime = endTime;
        
        const offset = adjustedServerTime - localTime;
        totalOffset += offset;
        
        logger.debug(`Time sync attempt ${i + 1}`, {
          serverTime,
          localTime,
          networkDelay,
          offset,
          adjustedServerTime
        });
        
        // Small delay between attempts
        if (i < attempts - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Use average offset from all attempts
      this.timeOffset = Math.round(totalOffset / attempts);
      
      // Add a small buffer to account for processing time
      this.timeOffset += 200; // Increased buffer to 200ms
      
      logger.info('Time synchronized with Binance servers', {
        attempts,
        averageOffset: this.timeOffset,
        correctedTime: Date.now() + this.timeOffset,
        finalTimestamp: Math.floor(Date.now() + this.timeOffset)
      });
    } catch (error) {
      logger.warn('Failed to sync time with Binance servers, using local time', error);
      this.timeOffset = 0;
    }
  }


  /**
   * Set position side mode (HEDGE or ONE_WAY)
   * Note: This method is disabled due to API method availability issues
   * The positionSide parameter in orders will handle the mode requirements
   */
  private async setPositionSideMode(dualSidePosition: boolean): Promise<void> {
    try {
      // Try to use the generic request method if available
      if (typeof this.client.request === 'function') {
        await this.client.request({
          method: 'POST',
          path: '/fapi/v1/positionSide/dual',
          data: {
            dualSidePosition: dualSidePosition
          }
        });
        
        const mode = dualSidePosition ? 'HEDGE' : 'ONE_WAY';
        logger.info(`Position side mode set to ${mode} for account`);
      } else {
        // If no generic request method is available, skip this step
        logger.warn('Position side mode setting not available - using positionSide parameter in orders');
        logger.info('Please manually set your Binance account to HEDGE mode in the web interface');
      }
    } catch (error) {
      // If the mode is already set, we can ignore this error
      if (error instanceof Error && error.message?.includes('No need to change position side')) {
        const mode = dualSidePosition ? 'HEDGE' : 'ONE_WAY';
        logger.info(`Position side mode already set to ${mode} for account`);
      } else {
        logger.warn('Could not set position side mode programmatically', error);
        logger.info('Please manually set your Binance account to HEDGE mode in the web interface');
        // Don't throw error - continue with positionSide parameter in orders
      }
    }
  }

  /**
   * Set leverage for the trading pair
   */
  private async setLeverage(): Promise<void> {
    try {
      // Set different leverages for different position types
      // This will be handled per position when opening trades
      logger.info(`Leverage will be set per position for ${this.config.tradingPair}`);
    } catch (error) {
      logger.error('Failed to set leverage', error);
      throw error;
    }
  }

  /**
   * Set margin mode to ISOLATED for the trading pair
   * This is CRITICAL for our hedge strategy to work properly
   */
  private async setMarginMode(): Promise<void> {
    try {
      await this.client.futuresMarginType({
        symbol: this.config.tradingPair,
        marginType: 'ISOLATED'
      });
      logger.info(`Margin mode set to ISOLATED for ${this.config.tradingPair}`);
    } catch (error) {
      // If already set to isolated, this will throw an error - that's fine
      if (error instanceof Error && error.message?.includes('No need to change margin type')) {
        logger.info(`Margin mode already set to ISOLATED for ${this.config.tradingPair}`);
      } else {
        logger.error('Failed to set margin mode to ISOLATED', error);
        throw error;
      }
    }
  }

  /**
   * Get current market price with caching
   */
  async getCurrentPrice(): Promise<number> {
    try {
      // Check if we have a recent cached price
      const now = Date.now();
      if (this.cachedPrice && (now - this.lastPriceUpdate) < this.priceCacheTimeout) {
        return this.cachedPrice;
      }

      // Fetch fresh price from API
      const ticker = await this.client.futuresPrices({ symbol: this.config.tradingPair });
      const price = parseFloat(ticker[this.config.tradingPair]);
      
      // Update cache
      this.cachedPrice = price;
      this.lastPriceUpdate = now;
      
      return price;
    } catch (error) {
      logger.error('Failed to get current price', error);
      throw error;
    }
  }

  /**
   * Get cached price (fast, no API call)
   */
  getCachedPrice(): number | null {
    const now = Date.now();
    if (this.cachedPrice && (now - this.lastPriceUpdate) < this.priceCacheTimeout) {
      return this.cachedPrice;
    }
    return null;
  }

  /**
   * Start real-time price updates
   */
  private startRealTimePriceUpdates(): void {
    // Clear any existing interval
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
    }

    // Update price every 20 seconds (aligned with quick decision loop)
    this.priceUpdateInterval = setInterval(async () => {
      try {
        const ticker = await this.client.futuresPrices({ symbol: this.config.tradingPair });
        const price = parseFloat(ticker[this.config.tradingPair]);
        
        const oldPrice = this.cachedPrice;
        this.cachedPrice = price;
        this.lastPriceUpdate = Date.now();
        
        // Log significant price changes
        if (oldPrice && Math.abs(price - oldPrice) / oldPrice > 0.001) { // 0.1% change
          logger.debug('Price updated', {
            oldPrice: oldPrice.toFixed(4),
            newPrice: price.toFixed(4),
            change: `${((price - oldPrice) / oldPrice * 100).toFixed(2)}%`,
            symbol: this.config.tradingPair
          });
        }
      } catch (error) {
        logger.error('Failed to update cached price', error);
      }
    }, this.priceCacheTimeout);

    logger.info('Real-time price updates started', {
      interval: `${this.priceCacheTimeout / 1000}s`,
      symbol: this.config.tradingPair
    });
  }

  /**
   * Stop real-time price updates
   */
  private stopRealTimePriceUpdates(): void {
    if (this.priceUpdateInterval) {
      clearInterval(this.priceUpdateInterval);
      this.priceUpdateInterval = null;
      logger.info('Real-time price updates stopped');
    }
  }

  /**
   * Get service configuration
   */
  getConfig(): TradingConfig {
    return this.config;
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.stopRealTimePriceUpdates();
  }

  /**
   * Get kline data for technical analysis
   */
  async getKlines(timeframe: '15m' | '1h' | '4h', limit: number = 100): Promise<MarketData[]> {
    try {
      const klines = await this.client.futuresCandles({
        symbol: this.config.tradingPair,
        interval: timeframe,
        limit: limit
      });

      if (!klines || klines.length === 0) {
        logger.warn('No kline data received from Binance API', {
          symbol: this.config.tradingPair,
          timeframe,
          limit
        });
        return [];
      }

      const marketData = klines.map((kline: any) => ({
        symbol: this.config.tradingPair,
        price: parseFloat(kline.close),
        volume: parseFloat(kline.volume),
        timestamp: new Date(kline.openTime),
        timeframe: timeframe
      }));

      logger.debug('Kline data fetched successfully', {
        symbol: this.config.tradingPair,
        timeframe,
        limit,
        actualLength: marketData.length,
        firstPrice: marketData[0]?.price,
        lastPrice: marketData[marketData.length - 1]?.price
      });

      return marketData;
    } catch (error) {
      logger.error('Failed to get kline data', {
        symbol: this.config.tradingPair,
        timeframe,
        limit,
        error
      });
      throw error;
    }
  }


  /**
   * Open a new position
   */
  async openPosition(
    side: 'LONG' | 'SHORT',
    size: number,
    leverage: number
  ): Promise<Position> {
    try {
      // Set leverage for this position
      await this.client.futuresLeverage({
        symbol: this.config.tradingPair,
        leverage: leverage
      });

      // Calculate position size in USDT using dynamic balance
      const currentPrice = await this.getCurrentPrice();
      const effectiveBalance = await this.getEffectiveBalance();
      // For futures: Notional Value = size * effectiveBalance * leverage
      const notionalValue = size * effectiveBalance * leverage;
      const positionSize = notionalValue / currentPrice;

      // Open the position - round to whole numbers for ADAUSDT (Binance requirement)
      const roundedQuantity = Math.round(positionSize);
      
      logger.info('Position sizing calculation (Dynamic Balance)', {
        side,
        size,
        leverage,
        effectiveBalance: effectiveBalance.toFixed(2),
        configBaseBalance: this.config.baseBalance.toFixed(2),
        currentPrice: currentPrice.toFixed(4),
        notionalValue: notionalValue.toFixed(2),
        positionSize: positionSize.toFixed(6),
        roundedQuantity: roundedQuantity.toString(),
        balanceDifference: (effectiveBalance - this.config.baseBalance).toFixed(2)
      });
      // In Hedge Mode, we need to specify positionSide for each order
      const order = await this.client.futuresOrder({
        symbol: this.config.tradingPair,
        side: side === 'LONG' ? 'BUY' : 'SELL',
        type: 'MARKET',
        quantity: roundedQuantity.toString(),
        positionSide: side // Add positionSide parameter for hedge mode
      });

      const position: Position = {
        id: order.orderId.toString(),
        symbol: this.config.tradingPair,
        side: side,
        type: 'ANCHOR', // This will be set by the strategy engine
        size: positionSize, // Keep for backward compatibility
        quantity: roundedQuantity, // Add quantity field
        entryPrice: parseFloat(order.avgPrice) || currentPrice, // Use current price if avgPrice is 0
        leverage: leverage,
        stopLoss: 0, // No stop-loss needed - liquidation happens first
        status: 'OPEN',
        openTime: new Date(),
      };

      logger.info('Position opened', { 
        position, 
        notionalValue, 
        positionSize, 
        leverage,
        marginUsed: size * effectiveBalance
      });
      return position;
    } catch (error) {
      logger.error('Failed to open position', error);
      throw error;
    }
  }

  /**
   * Close a position
   */
  async closePosition(position: Position): Promise<void> {
    try {
      // In Hedge Mode, we need to specify positionSide for each order
      const order = await this.client.futuresOrder({
        symbol: this.config.tradingPair,
        side: position.side === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
        quantity: (position.size || position.quantity).toFixed(3),
        positionSide: position.side // Add positionSide parameter for hedge mode
      });

      position.status = 'CLOSED';
      position.closeTime = new Date();
      position.pnl = this.calculatePnL(position, parseFloat(order.avgPrice));

      logger.info('Position closed', position);
    } catch (error) {
      logger.error('Failed to close position', error);
      throw error;
    }
  }

  /**
   * Get current positions with retry logic
   */
  async getCurrentPositions(): Promise<Position[]> {
    if (!this.client) {
      throw new Error('Binance client not initialized. Call initialize() first.');
    }
    
    const maxRetries = 3;
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const positions = await this.client.futuresPositionRisk({
          symbol: this.config.tradingPair
        });

      const activePositions = positions.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);
      
      // Sort positions by entry time to determine which is original vs hedge
      const sortedPositions = activePositions.sort((a: any, b: any) => {
        const timeA = new Date(parseInt(a.updateTime)).getTime();
        const timeB = new Date(parseInt(b.updateTime)).getTime();
        return timeA - timeB; // Earlier position first
      });

      return sortedPositions.map((pos: any, index: number) => {
        const positionSize = Math.abs(parseFloat(pos.positionAmt));
        const leverage = parseFloat(pos.leverage);
        const side = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT';
        
        // Determine position type based on creation order and characteristics
        let positionType: 'ANCHOR' | 'ANCHOR_HEDGE' | 'OPPORTUNITY' | 'OPPORTUNITY_HEDGE' | 'SCALP' | 'SCALP_HEDGE' | 'HF';
        
        if (activePositions.length === 1) {
          // Single position - likely original
          // MODIFIED: In HF-only mode, classify single positions as HF
          const isHFOnlyMode = true; // Since we disabled other strategies
          
          if (isHFOnlyMode) {
            // All positions in HF-only mode are HF positions
            positionType = 'HF';
          } else {
            // Original logic for multi-strategy mode
            if (leverage >= 20) {
              positionType = positionSize > 100 ? 'ANCHOR' : 'SCALP';
            } else if (leverage >= 15) {
              // For 15x leverage, consider size: large positions are ANCHOR, small are SCALP
              positionType = positionSize > 200 ? 'ANCHOR' : 'SCALP';
            } else {
              positionType = positionSize > 200 ? 'ANCHOR' : 'OPPORTUNITY';
            }
          }
        } else if (activePositions.length === 2) {
          // Two positions - first is original, second is hedge
          if (index === 0) {
            // First position (original)
            if (leverage >= 20) {
              positionType = positionSize > 100 ? 'ANCHOR' : 'SCALP';
            } else if (leverage >= 15) {
              // For 15x leverage, consider size: large positions are ANCHOR, small are SCALP
              positionType = positionSize > 200 ? 'ANCHOR' : 'SCALP';
            } else {
              positionType = positionSize > 200 ? 'ANCHOR' : 'OPPORTUNITY';
            }
          } else {
            // Second position (hedge)
            if (leverage >= 20) {
              positionType = positionSize > 100 ? 'ANCHOR_HEDGE' : 'SCALP_HEDGE';
            } else if (leverage >= 15) {
              // For 15x leverage hedge, consider size: large positions are ANCHOR_HEDGE, small are SCALP_HEDGE
              positionType = positionSize > 200 ? 'ANCHOR_HEDGE' : 'SCALP_HEDGE';
            } else {
              positionType = positionSize > 200 ? 'ANCHOR_HEDGE' : 'OPPORTUNITY_HEDGE';
            }
          }
        } else {
          // Multiple positions - use heuristics
          // MODIFIED: In HF-only mode, classify all new positions as HF
          // Check if we're in HF-only mode (no hedge strategy active)
          const isHFOnlyMode = true; // Since we disabled other strategies
          
          if (isHFOnlyMode) {
            // All positions in HF-only mode are HF positions
            positionType = 'HF';
          } else {
            // Original logic for multi-strategy mode
            if (leverage >= 20) {
              positionType = positionSize > 100 ? 'ANCHOR_HEDGE' : 'SCALP_HEDGE';
            } else if (leverage >= 15) {
              // For 15x leverage, consider size: large positions are ANCHOR, small are SCALP
              positionType = positionSize > 200 ? 'ANCHOR' : 'SCALP';
            } else {
              positionType = positionSize > 200 ? 'ANCHOR' : 'OPPORTUNITY';
            }
          }
        }

        logger.info('🔍 Position type determination', {
          symbol: pos.symbol,
          side: side,
          positionSize: positionSize,
          leverage: leverage,
          positionIndex: index,
          totalPositions: activePositions.length,
          determinedType: positionType,
          entryTime: new Date(parseInt(pos.updateTime)).toISOString()
        });

        return {
          id: pos.symbol,
          symbol: pos.symbol,
          side: side,
          type: positionType,
          size: positionSize,
          quantity: positionSize, // Add quantity field for compatibility
          entryPrice: parseFloat(pos.entryPrice),
          leverage: leverage,
          liquidationPrice: parseFloat(pos.liquidationPrice),
          stopLoss: 0, // Will be set by strategy
          status: 'OPEN',
          openTime: new Date(parseInt(pos.updateTime)), // Use actual entry time
        };
      });
      
      } catch (error: any) {
        lastError = error;
        
        if (error.code === -1021) {
          logger.warn(`Timestamp error in getCurrentPositions (attempt ${attempt}/${maxRetries})`, {
            code: error.code,
            message: error.message
          });
          // For timestamp errors, try to resync time before retrying
          if (attempt < maxRetries) {
            try {
              await this.syncTime();
              logger.info('Time resynced, retrying getCurrentPositions...');
            } catch (syncError) {
              logger.warn('Failed to resync time', syncError);
            }
          }
        } else {
          logger.warn(`Failed to get current positions (attempt ${attempt}/${maxRetries})`, error);
        }
        
        if (attempt < maxRetries) {
          // Wait before retrying (exponential backoff)
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          logger.info(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all retries failed
    logger.error('Failed to get current positions after all retries', lastError);
    throw lastError;
  }

  /**
   * Get account balance (with caching for performance)
   */
  async getAccountBalance(): Promise<{ total: number; available: number }> {
    if (!this.client) {
      throw new Error('Binance client not initialized. Call initialize() first.');
    }
    
    try {
      const now = Date.now();
      
      // Return cached balance if it's still fresh
      if (this.cachedBalance && (now - this.lastBalanceUpdate) < this.balanceCacheTimeout) {
        return this.cachedBalance;
      }
      
      // Fetch fresh balance from Binance
      const account = await this.client.futuresAccountInfo();
      const balance = account.assets.find((asset: any) => asset.asset === 'USDT');
      
      const freshBalance = {
        total: parseFloat(balance.walletBalance),
        available: parseFloat(balance.availableBalance)
      };
      
      // Update cache
      this.cachedBalance = freshBalance;
      this.lastBalanceUpdate = now;
      
      logger.info('Balance updated', {
        total: freshBalance.total.toFixed(2),
        available: freshBalance.available.toFixed(2),
        cacheAge: '0s (fresh)'
      });

      // WebSocket broadcast removed to avoid circular dependency
      // Balance updates are logged instead
      
      return freshBalance;
    } catch (error) {
      logger.error('Failed to get account balance', error);
      throw error;
    }
  }

  /**
   * Get current effective balance for position sizing
   * Uses real-time balance instead of static config value
   */
  async getEffectiveBalance(): Promise<number> {
    try {
      const balance = await this.getAccountBalance();
      
      // Use the total wallet balance for position sizing
      // This includes both available and used margin
      const effectiveBalance = balance.total;
      
      logger.info('Effective balance for position sizing', {
        totalBalance: balance.total.toFixed(2),
        availableBalance: balance.available.toFixed(2),
        effectiveBalance: effectiveBalance.toFixed(2),
        configBaseBalance: this.config.baseBalance.toFixed(2),
        usingDynamicBalance: true
      });
      
      return effectiveBalance;
    } catch (error) {
      logger.error('Failed to get effective balance, falling back to config', error);
      // Fallback to config value if API fails
      return this.config.baseBalance;
    }
  }

  /**
   * Force refresh balance cache (useful when you know balance has changed)
   */
  async refreshBalance(): Promise<{ total: number; available: number }> {
    this.cachedBalance = null;
    this.lastBalanceUpdate = 0;
    return await this.getAccountBalance();
  }

  /**
   * Calculate PnL for a position
   */
  private calculatePnL(position: Position, exitPrice: number): number {
    const priceDiff = exitPrice - position.entryPrice;
    const multiplier = position.side === 'LONG' ? 1 : -1;
    return (priceDiff * multiplier * (position.size || position.quantity) * position.leverage) / position.entryPrice;
  }

  /**
   * Handle liquidation event (for isolated mode)
   */
  async handleLiquidation(position: Position): Promise<void> {
    try {
      // Find corresponding hedge position
      const hedgeType = position.type === 'ANCHOR' ? 'ANCHOR_HEDGE' : 'OPPORTUNITY_HEDGE';
      const hedgePosition = await this.getPositionByType(hedgeType);
      
      if (hedgePosition && hedgePosition.status === 'OPEN') {
        // Close hedge at liquidation price
        await this.closePositionAtPrice(hedgePosition, position.entryPrice);
        logger.info('Hedge closed at liquidation price', { 
          positionId: position.id, 
          hedgeId: hedgePosition.id,
          liquidationPrice: position.entryPrice 
        });
      }
    } catch (error) {
      logger.error('Failed to handle liquidation', error);
      throw error;
    }
  }

  /**
   * Close position at specific price (for isolated mode)
   */
  private async closePositionAtPrice(position: Position, price: number): Promise<void> {
    try {
      // In Hedge Mode, we need to specify positionSide for each order
      const order = await this.client.futuresOrder({
        symbol: this.config.tradingPair,
        side: position.side === 'LONG' ? 'SELL' : 'BUY',
        type: 'LIMIT',
        quantity: (position.size || position.quantity).toFixed(3),
        price: price.toFixed(4),
        positionSide: position.side // Add positionSide parameter for hedge mode
      });

      position.status = 'CLOSED';
      position.closeTime = new Date();
      position.pnl = this.calculatePnL(position, price);

      logger.info('Position closed at specific price', { position, price });
    } catch (error) {
      logger.error('Failed to close position at price', error);
      throw error;
    }
  }

  /**
   * Get position by type
   */
  private async getPositionByType(type: string): Promise<Position | null> {
    const positions = await this.getCurrentPositions();
    return positions.find(pos => pos.type === type) || null;
  }

  /**
   * Set take profit order for a position
   */
  async setTakeProfitOrder(position: Position, takeProfitPrice: number): Promise<void> {
    try {
      // In Hedge Mode, we need to specify positionSide for each order
      await this.client.futuresOrder({
        symbol: this.config.tradingPair,
        side: position.side === 'LONG' ? 'SELL' : 'BUY',
        type: 'TAKE_PROFIT_MARKET',
        quantity: (position.size || position.quantity).toFixed(3),
        stopPrice: takeProfitPrice.toFixed(4),
        timeInForce: 'GTC',
        positionSide: position.side // Add positionSide parameter for hedge mode
      });

      logger.info('Take profit order set', {
        positionId: position.id,
        takeProfitPrice,
        side: position.side
      });
    } catch (error) {
      logger.error('Failed to set take profit order', error);
      throw error;
    }
  }

  /**
   * Get 24h ticker statistics
   */
  async get24hTicker(): Promise<any> {
    try {
      const ticker = await this.client.futuresDaily({
        symbol: this.config.tradingPair
      });
      return ticker;
    } catch (error) {
      logger.error('Failed to get 24h ticker', error);
      throw error;
    }
  }

  /**
   * Get trading pair symbol
   */
  getTradingPair(): string {
    return this.config.tradingPair;
  }

  /**
   * Get all open positions from Binance
   */
  async getOpenPositions(): Promise<Position[]> {
    if (!this.client) {
      throw new Error('Binance client not initialized. Call initialize() first.');
    }
    
    try {
      const positions = await this.client.futuresPositionRisk({
        symbol: this.config.tradingPair
      });

      const openPositions: Position[] = positions
        .filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
        .map((pos: any) => ({
          id: pos.symbol + '_' + pos.positionSide,
          symbol: pos.symbol,
          side: pos.positionSide as 'LONG' | 'SHORT',
          entryPrice: parseFloat(pos.entryPrice),
          quantity: Math.abs(parseFloat(pos.positionAmt)),
          leverage: parseFloat(pos.leverage),
          status: 'OPEN' as const,
          type: 'ANCHOR' as const, // Will be updated by PositionManager
          pnl: parseFloat(pos.unrealizedPnl),
          liquidationPrice: parseFloat(pos.liquidationPrice)
        }));

      logger.debug('Open positions fetched', {
        symbol: this.config.tradingPair,
        count: openPositions.length,
        positions: openPositions.map(p => ({
          side: p.side,
          entryPrice: p.entryPrice,
          quantity: p.quantity,
          pnl: p.pnl
        }))
      });

      return openPositions;
    } catch (error: any) {
      if (error.code === -1021) {
        logger.warn('Timestamp error in getOpenPositions, attempting time resync', {
          code: error.code,
          message: error.message
        });
        // Attempt to resync time and retry once
        try {
          await this.syncTime();
          const positions = await this.client.futuresPositionRisk({
            symbol: this.config.tradingPair
          });
          const openPositions: Position[] = positions
            .filter((pos: any) => parseFloat(pos.positionAmt) !== 0)
            .map((pos: any) => ({
              id: pos.symbol + '_' + pos.positionSide,
              symbol: pos.symbol,
              side: pos.positionSide as 'LONG' | 'SHORT',
              entryPrice: parseFloat(pos.entryPrice),
              quantity: Math.abs(parseFloat(pos.positionAmt)),
              leverage: parseFloat(pos.leverage),
              status: 'OPEN' as const,
              type: 'ANCHOR' as const, // Will be updated by PositionManager
              pnl: parseFloat(pos.unrealizedPnl),
              liquidationPrice: parseFloat(pos.liquidationPrice)
            }));
          logger.info('Successfully retried getOpenPositions after time resync');
          return openPositions;
        } catch (retryError) {
          logger.error('Failed to get open positions even after time resync', retryError);
          throw retryError;
        }
      }
      logger.error('Failed to get open positions', error);
      throw error;
    }
  }
}
