import { logger } from '../utils/logger';
import { WebSocketService } from './WebSocketService';

export interface BotInstance {
  id: string;
  symbol: string;
  isRunning: boolean;
  startTime?: Date | undefined;
  stopTime?: Date | undefined;
  tradingBot?: any; // Reference to the actual TradingBot instance
}

export class BotManager {
  private static instance: BotManager;
  private bots: Map<string, BotInstance> = new Map();
  private webSocketService: WebSocketService;

  private constructor() {
    this.webSocketService = WebSocketService.getInstance();
  }

  public static getInstance(): BotManager {
    if (!BotManager.instance) {
      BotManager.instance = new BotManager();
    }
    return BotManager.instance;
  }

  public registerBot(symbol: string, tradingBot: any): void {
    const botId = `${symbol}_${Date.now()}`;
    const botInstance: BotInstance = {
      id: botId,
      symbol,
      isRunning: false,
      tradingBot
    };

    this.bots.set(symbol, botInstance);
    logger.info(`Bot registered: ${symbol}`, { botId });
    
    // Broadcast bot registration
    this.webSocketService.broadcastLogEntry(`Bot registered: ${symbol}`, 'info');
  }

  public async startBot(symbol: string): Promise<boolean> {
    const bot = this.bots.get(symbol);
    if (!bot) {
      logger.error(`Bot not found: ${symbol}`);
      this.webSocketService.broadcastLogEntry(`Bot not found: ${symbol}`, 'error');
      return false;
    }

    if (bot.isRunning) {
      logger.warn(`Bot already running: ${symbol}`);
      this.webSocketService.broadcastLogEntry(`Bot already running: ${symbol}`, 'warn');
      return false;
    }

    try {
      if (bot.tradingBot) {
        await bot.tradingBot.start();
        bot.isRunning = true;
        bot.startTime = new Date();
        bot.stopTime = undefined;

        logger.info(`Bot started: ${symbol}`);
        this.webSocketService.broadcastLogEntry(`Bot started: ${symbol}`, 'info');
        
        // Broadcast bot status update
        this.webSocketService.broadcastBotStatus({
          status: 'running',
          timestamp: new Date().toISOString(),
          version: '2.0.3'
        });

        return true;
      } else {
        logger.error(`TradingBot instance not available for: ${symbol}`);
        this.webSocketService.broadcastLogEntry(`TradingBot instance not available for: ${symbol}`, 'error');
        return false;
      }
    } catch (error) {
      logger.error(`Failed to start bot: ${symbol}`, error);
      this.webSocketService.broadcastLogEntry(`Failed to start bot: ${symbol}`, 'error');
      return false;
    }
  }

  public async stopBot(symbol: string): Promise<boolean> {
    const bot = this.bots.get(symbol);
    if (!bot) {
      logger.error(`Bot not found: ${symbol}`);
      this.webSocketService.broadcastLogEntry(`Bot not found: ${symbol}`, 'error');
      return false;
    }

    if (!bot.isRunning) {
      logger.warn(`Bot not running: ${symbol}`);
      this.webSocketService.broadcastLogEntry(`Bot not running: ${symbol}`, 'warn');
      return false;
    }

    try {
      if (bot.tradingBot) {
        await bot.tradingBot.stop();
        bot.isRunning = false;
        bot.stopTime = new Date();

        logger.info(`Bot stopped: ${symbol}`);
        this.webSocketService.broadcastLogEntry(`Bot stopped: ${symbol}`, 'info');
        
        // Broadcast bot status update
        this.webSocketService.broadcastBotStatus({
          status: 'stopped',
          timestamp: new Date().toISOString(),
          version: '2.0.3'
        });

        return true;
      } else {
        logger.error(`TradingBot instance not available for: ${symbol}`);
        this.webSocketService.broadcastLogEntry(`TradingBot instance not available for: ${symbol}`, 'error');
        return false;
      }
    } catch (error) {
      logger.error(`Failed to stop bot: ${symbol}`, error);
      this.webSocketService.broadcastLogEntry(`Failed to stop bot: ${symbol}`, 'error');
      return false;
    }
  }

  public async startAllBots(): Promise<{ success: string[], failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const [symbol, bot] of this.bots) {
      try {
        const result = await this.startBot(symbol);
        if (result) {
          success.push(symbol);
        } else {
          failed.push(symbol);
        }
      } catch (error) {
        failed.push(symbol);
        logger.error(`Failed to start bot: ${symbol}`, error);
      }
    }

    logger.info(`Start all bots completed`, { success, failed });
    this.webSocketService.broadcastLogEntry(`Start all bots completed: ${success.length} success, ${failed.length} failed`, 'info');

    return { success, failed };
  }

  public async stopAllBots(): Promise<{ success: string[], failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const [symbol, bot] of this.bots) {
      try {
        const result = await this.stopBot(symbol);
        if (result) {
          success.push(symbol);
        } else {
          failed.push(symbol);
        }
      } catch (error) {
        failed.push(symbol);
        logger.error(`Failed to stop bot: ${symbol}`, error);
      }
    }

    logger.info(`Stop all bots completed`, { success, failed });
    this.webSocketService.broadcastLogEntry(`Stop all bots completed: ${success.length} success, ${failed.length} failed`, 'info');

    return { success, failed };
  }

  public getBotStatus(symbol?: string): BotInstance | BotInstance[] | null {
    if (symbol) {
      return this.bots.get(symbol) || null;
    }
    return Array.from(this.bots.values());
  }

  public getRunningBots(): BotInstance[] {
    return Array.from(this.bots.values()).filter(bot => bot.isRunning);
  }

  public getStoppedBots(): BotInstance[] {
    return Array.from(this.bots.values()).filter(bot => !bot.isRunning);
  }

  public getOverallStatus(): { total: number, running: number, stopped: number } {
    const total = this.bots.size;
    const running = this.getRunningBots().length;
    const stopped = this.getStoppedBots().length;

    return { total, running, stopped };
  }
}