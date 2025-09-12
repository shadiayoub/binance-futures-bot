/**
 * Multi-Pair Trading Bot Entry Point
 * Supports running multiple trading pairs independently
 */

import { 
  createMultiPairConfig,
  getAvailablePairs,
  getEnabledPairs,
  BOT_VERSION,
  VERSION_INFO
} from './config';
import { PairFactory } from './services/PairFactory';
import { TradingBot } from './TradingBot';
import { logger } from './utils/logger';

async function main() {
  try {
    // Log version information
    logger.info('🚀 Multi-Pair ADA Futures Trading Bot v' + BOT_VERSION, {
      version: BOT_VERSION,
      buildDate: VERSION_INFO.buildDate,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    });
    
    // Load multi-pair configuration
    const multiPairConfig = createMultiPairConfig();
    
    logger.info('Multi-pair configuration loaded', {
      activePairs: multiPairConfig.activePairs,
      availablePairs: getAvailablePairs(),
      enabledPairs: getEnabledPairs(),
      testnet: multiPairConfig.global.testnet
    });
    
    // Validate configuration
    if (multiPairConfig.activePairs.length === 0) {
      throw new Error('No active pairs configured. Set ACTIVE_PAIRS environment variable.');
    }

    // Validate multi-pair sizing safety
    const sizingValidation = PairFactory.validateMultiPairConfiguration(
      multiPairConfig.activePairs,
      Array.from(multiPairConfig.pairs.values())
    );

    logger.info('Multi-pair sizing validation', {
      isSafe: sizingValidation.isSafe,
      totalExposure: `${(sizingValidation.totalExposure * 100).toFixed(1)}%`,
      maxSafe: `${(sizingValidation.maxSafe * 100)}%`,
      recommendation: sizingValidation.recommendation
    });

    if (!sizingValidation.isSafe) {
      logger.warn('⚠️ Multi-pair configuration may be unsafe', {
        details: sizingValidation.details
      });
    } else {
      logger.info('✅ Multi-pair configuration is safe', {
        details: sizingValidation.details
      });
    }
    
    // Create and start bots for each active pair
    const pairBots: Map<string, TradingBot> = new Map();
    
    for (const symbol of multiPairConfig.activePairs) {
      const pairConfig = multiPairConfig.pairs.get(symbol);
      
      if (!pairConfig) {
        logger.error(`No configuration found for pair: ${symbol}`);
        continue;
      }
      
      if (!pairConfig.enabled) {
        logger.warn(`Pair ${symbol} is disabled, skipping`);
        continue;
      }
      
      try {
        logger.info(`Creating trading bot for ${symbol}`, {
          symbol,
          name: pairConfig.name,
          baseBalance: pairConfig.baseBalance
        });
        
        // Create pair-specific services with automatic sizing
        const pairServices = await PairFactory.createPairServices(pairConfig, multiPairConfig.activePairs);
        
        // Create trading bot instance
        const bot = new TradingBot(
          {
            apiKey: multiPairConfig.global.apiKey,
            secretKey: multiPairConfig.global.secretKey,
            testnet: multiPairConfig.global.testnet,
            tradingPair: symbol,
            baseBalance: pairConfig.baseBalance,
            riskPerTrade: 0,
            historical4hDays: multiPairConfig.system.historical4hDays,
            historical1hDays: multiPairConfig.system.historical1hDays,
            historical15mDays: multiPairConfig.system.historical15mDays,
            priceUpdateInterval: multiPairConfig.system.priceUpdateInterval,
          },
          pairConfig.positionSizing,
          pairConfig.leverageSettings,
          pairConfig.technicalConfig,
          pairConfig.supportResistanceLevels
        );
        
        // Initialize and start the bot
        await bot.initialize();
        await bot.start();
        
        pairBots.set(symbol, bot);
        
        logger.info(`✅ Successfully started trading bot for ${symbol}`, {
          symbol,
          name: pairConfig.name
        });
        
      } catch (error) {
        logger.error(`Failed to start trading bot for ${symbol}`, error);
        // Continue with other pairs even if one fails
      }
    }
    
    if (pairBots.size === 0) {
      throw new Error('No trading bots were successfully started');
    }
    
    logger.info('🎯 Multi-Pair Trading Bot is running', {
      activeBots: Array.from(pairBots.keys()),
      totalBots: pairBots.size
    });
    
    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Received shutdown signal, stopping all bots...');
      
      for (const [symbol, bot] of pairBots) {
        try {
          await bot.stop();
          logger.info(`Stopped trading bot for ${symbol}`);
        } catch (error) {
          logger.error(`Error stopping bot for ${symbol}`, error);
        }
      }
      
      logger.info('All trading bots stopped');
      process.exit(0);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      logger.error('Uncaught exception', error);
      await shutdown();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      await shutdown();
      process.exit(1);
    });
    
    logger.info('Press Ctrl+C to stop all bots');
    
  } catch (error) {
    logger.error('Failed to start multi-pair trading bot', error);
    process.exit(1);
  }
}

// Start the application
main().catch((error) => {
  logger.error('Fatal error', error);
  process.exit(1);
});
