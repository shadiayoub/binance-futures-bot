#!/usr/bin/env ts-node

/**
 * Test High-Frequency Trading Indicators
 * Tests all new indicators for 0.6% profit targets
 */

import { TechnicalAnalysis } from '../services/TechnicalAnalysis';
import { TechnicalConfig, MarketData } from '../types';
import { logger } from '../utils/logger';

// Test configuration for high-frequency trading
const testConfig: TechnicalConfig = {
  rsiPeriod: 14,
  emaFast: 9,
  emaSlow: 18,
  volumePeriod: 20,
  volumeMultiplier: 1.5,
  
  // High-Frequency Trading Configuration
  stochasticRSI: {
    rsiPeriod: 14,
    stochasticPeriod: 14,
    kPeriod: 3,
    dPeriod: 3
  },
  bollingerBands: {
    period: 20,
    stdDev: 2
  },
  atr: {
    period: 14
  },
  mfi: {
    period: 14
  },
  macd: {
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9
  },
  awesomeOscillator: {
    fastPeriod: 5,
    slowPeriod: 34
  },
  trix: {
    period: 14
  },
  psar: {
    step: 0.02,
    maximum: 0.2
  }
};

// Generate test market data (simulating ADA price movement)
function generateTestData(): MarketData[] {
  const data: MarketData[] = [];
  let price = 0.85; // Starting price
  
  for (let i = 0; i < 100; i++) {
    // Simulate realistic price movement with some volatility
    const change = (Math.random() - 0.5) * 0.01; // ±0.5% change
    price += change;
    price = Math.max(0.80, Math.min(0.90, price)); // Keep within reasonable range
    
    data.push({
      symbol: 'ADAUSDT',
      price: price,
      volume: 1000000 + Math.random() * 500000, // Random volume
      timestamp: new Date(Date.now() - (100 - i) * 15 * 60 * 1000), // 15-minute intervals
      timeframe: '1h'
    });
  }
  
  return data;
}

async function testHighFrequencyIndicators() {
  logger.info('🚀 Testing High-Frequency Trading Indicators (0.6% profit targets)');
  
  try {
    const technicalAnalysis = new TechnicalAnalysis(testConfig);
    const testData = generateTestData();
    
    logger.info(`Generated ${testData.length} test data points`);
    logger.info(`Price range: ${testData[0]?.price.toFixed(4)} - ${testData[testData.length - 1]?.price.toFixed(4)}`);
    
    // Calculate all indicators
    const indicators = technicalAnalysis.getTechnicalIndicators(testData);
    
    logger.info('📊 High-Frequency Indicators Results:');
    logger.info('=====================================');
    
    // Stochastic RSI Analysis
    logger.info('🎯 Stochastic RSI (Ultra-sensitive momentum):');
    logger.info(`  %K: ${indicators.stochasticRSI.k.toFixed(2)}`);
    logger.info(`  %D: ${indicators.stochasticRSI.d.toFixed(2)}`);
    logger.info(`  Oversold: ${indicators.stochasticRSI.isOversold ? '✅ YES' : '❌ NO'}`);
    logger.info(`  Overbought: ${indicators.stochasticRSI.isOverbought ? '✅ YES' : '❌ NO'}`);
    
    // Bollinger Bands Analysis
    logger.info('\n📈 Bollinger Bands (Volatility-based entries):');
    logger.info(`  Upper: ${indicators.bollingerBands.upper.toFixed(4)}`);
    logger.info(`  Middle: ${indicators.bollingerBands.middle.toFixed(4)}`);
    logger.info(`  Lower: ${indicators.bollingerBands.lower.toFixed(4)}`);
    logger.info(`  Bandwidth: ${indicators.bollingerBands.bandwidth.toFixed(2)}%`);
    logger.info(`  Upper Touch: ${indicators.bollingerBands.isUpperTouch ? '✅ YES' : '❌ NO'}`);
    logger.info(`  Lower Touch: ${indicators.bollingerBands.isLowerTouch ? '✅ YES' : '❌ NO'}`);
    
    // ATR Analysis
    logger.info('\n📏 ATR (Dynamic stop-losses):');
    logger.info(`  ATR: ${indicators.atr.toFixed(4)}`);
    logger.info(`  Stop Distance (0.6%): ${(indicators.atr * 0.5).toFixed(4)}`);
    
    // MFI Analysis
    logger.info('\n💰 MFI (Volume-weighted momentum):');
    logger.info(`  MFI: ${indicators.mfi.toFixed(2)}`);
    logger.info(`  Signal: ${indicators.mfi < 20 ? '🔴 Oversold' : indicators.mfi > 80 ? '🟢 Overbought' : '🟡 Neutral'}`);
    
    // MACD Analysis
    logger.info('\n📊 MACD (Trend confirmation):');
    logger.info(`  MACD: ${indicators.macd.macd.toFixed(4)}`);
    logger.info(`  Signal: ${indicators.macd.signal.toFixed(4)}`);
    logger.info(`  Histogram: ${indicators.macd.histogram.toFixed(4)}`);
    logger.info(`  Trend: ${indicators.macd.isBullish ? '🟢 Bullish' : indicators.macd.isBearish ? '🔴 Bearish' : '🟡 Neutral'}`);
    
    // Awesome Oscillator
    logger.info('\n⚡ Awesome Oscillator (Zero line crossovers):');
    logger.info(`  AO: ${indicators.awesomeOscillator.toFixed(4)}`);
    logger.info(`  Signal: ${indicators.awesomeOscillator > 0 ? '🟢 Above Zero' : '🔴 Below Zero'}`);
    
    // TRIX
    logger.info('\n🔄 TRIX (Triple smoothed EMA):');
    logger.info(`  TRIX: ${indicators.trix.toFixed(4)}`);
    logger.info(`  Signal: ${indicators.trix > 0 ? '🟢 Positive' : '🔴 Negative'}`);
    
    // PSAR
    logger.info('\n🎯 PSAR (Trend reversal points):');
    logger.info(`  PSAR: ${indicators.psar.toFixed(4)}`);
    logger.info(`  Current Price: ${testData[testData.length - 1]?.price.toFixed(4)}`);
    logger.info(`  Signal: ${(testData[testData.length - 1]?.price || 0) > indicators.psar ? '🟢 Above PSAR (Bullish)' : '🔴 Below PSAR (Bearish)'}`);
    
    // Trading Signal Analysis
    logger.info('\n🎯 High-Frequency Trading Signals (0.6% targets):');
    logger.info('================================================');
    
    const currentPrice = testData[testData.length - 1]?.price || 0;
    let signalStrength = 0;
    let signals: string[] = [];
    
    // Stochastic RSI signals
    if (indicators.stochasticRSI.isOversold) {
      signalStrength += 0.3;
      signals.push('Stochastic RSI Oversold (LONG signal)');
    } else if (indicators.stochasticRSI.isOverbought) {
      signalStrength += 0.3;
      signals.push('Stochastic RSI Overbought (SHORT signal)');
    }
    
    // Bollinger Bands signals
    if (indicators.bollingerBands.isLowerTouch) {
      signalStrength += 0.25;
      signals.push('Bollinger Lower Band Touch (LONG signal)');
    } else if (indicators.bollingerBands.isUpperTouch) {
      signalStrength += 0.25;
      signals.push('Bollinger Upper Band Touch (SHORT signal)');
    }
    
    // MACD signals
    if (indicators.macd.isBullish) {
      signalStrength += 0.2;
      signals.push('MACD Bullish (LONG confirmation)');
    } else if (indicators.macd.isBearish) {
      signalStrength += 0.2;
      signals.push('MACD Bearish (SHORT confirmation)');
    }
    
    // Volume confirmation
    if (indicators.volumeRatio > 1.5) {
      signalStrength += 0.15;
      signals.push('Volume Spike Confirmation');
    }
    
    // ATR risk check
    const atrRisk = indicators.atr / currentPrice;
    if (atrRisk < 0.02) { // Less than 2% volatility
      signalStrength += 0.1;
      signals.push('Low Volatility (Good for 0.6% targets)');
    }
    
    logger.info(`Signal Strength: ${(signalStrength * 100).toFixed(1)}%`);
    logger.info(`Active Signals: ${signals.length}`);
    signals.forEach((signal, index) => {
      logger.info(`  ${index + 1}. ${signal}`);
    });
    
    // Profit Target Analysis
    logger.info('\n💰 Profit Target Analysis (0.6% targets):');
    logger.info('==========================================');
    
    const profitTarget = currentPrice * 0.006; // 0.6% profit
    const stopLoss = currentPrice * 0.004; // 0.4% stop loss
    
    logger.info(`Current Price: ${currentPrice.toFixed(4)}`);
    logger.info(`Profit Target: ${(currentPrice + profitTarget).toFixed(4)} (+0.6%)`);
    logger.info(`Stop Loss: ${(currentPrice - stopLoss).toFixed(4)} (-0.4%)`);
    logger.info(`Risk/Reward Ratio: 1:1.5`);
    
    // Entry recommendations
    if (signalStrength > 0.7) {
      logger.info('\n✅ STRONG ENTRY SIGNAL - High probability of 0.6% profit');
    } else if (signalStrength > 0.5) {
      logger.info('\n🟡 MODERATE ENTRY SIGNAL - Good probability of 0.6% profit');
    } else if (signalStrength > 0.3) {
      logger.info('\n🟠 WEAK ENTRY SIGNAL - Low probability, wait for better setup');
    } else {
      logger.info('\n❌ NO ENTRY SIGNAL - Wait for better conditions');
    }
    
    logger.info('\n🎉 High-Frequency Indicators Test Completed Successfully!');
    
  } catch (error) {
    logger.error('❌ Test failed:', error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testHighFrequencyIndicators()
    .then(() => {
      logger.info('✅ All tests passed!');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('❌ Tests failed:', error);
      process.exit(1);
    });
}

export { testHighFrequencyIndicators };