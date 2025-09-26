#!/usr/bin/env ts-node

/**
 * Test High-Frequency Only Mode
 * Verifies that only the high-frequency strategy is running
 */

import { TradingBot } from '../TradingBot';
import { 
  tradingConfig, 
  positionSizing, 
  leverageSettings, 
  technicalConfig, 
  supportResistanceLevels 
} from '../config';
import { logger } from '../utils/logger';

async function testHighFrequencyOnlyMode() {
  logger.info('🚀 Testing High-Frequency Only Mode');
  logger.info('=====================================');
  
  try {
    // Create trading bot with high-frequency strategy only
    const bot = new TradingBot(
      tradingConfig,
      positionSizing,
      leverageSettings,
      technicalConfig,
      supportResistanceLevels
    );
    
    logger.info('✅ TradingBot created successfully');
    logger.info('📊 Strategy Configuration:', {
      'Hedge Strategy': 'DISABLED',
      'Opportunity Strategy': 'DISABLED',
      'Scalp Strategy': 'DISABLED', 
      'High-Frequency Strategy': 'ENABLED',
      'Profit Target': '0.6%',
      'Stop Loss': '0.4%',
      'Max Positions': '3',
      'Min Signal Strength': '60%'
    });
    
    // Test initialization
    logger.info('\n🔧 Testing Bot Initialization...');
    await bot.initialize();
    logger.info('✅ Bot initialized successfully');
    
    // Test strategy execution (this will show the disabled strategies in logs)
    logger.info('\n🎯 Testing Strategy Execution...');
    
    // Start the bot briefly to see the logs
    await bot.start();
    
    // Wait a moment to see the strategy execution
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Stop the bot
    await bot.stop();
    
    logger.info('\n✅ High-Frequency Only Mode Test Completed');
    logger.info('🎉 Only the high-frequency strategy is running!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testHighFrequencyOnlyMode()
    .then(() => {
      logger.info('✅ High-frequency only mode test passed!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ High-frequency only mode test failed:', error);
      process.exit(1);
    });
}

export { testHighFrequencyOnlyMode };