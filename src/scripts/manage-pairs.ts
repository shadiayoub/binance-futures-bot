#!/usr/bin/env ts-node

/**
 * Pair Management Script
 * Helps manage trading pairs and their configurations
 */

import { getAvailablePairs, getEnabledPairs, getPairConfig } from '../config/pairs';
import { createMultiPairConfig } from '../config';
import { PairLoader } from '../services/PairLoader';
import { logger } from '../utils/logger';

function displayHelp() {
  console.log('\n🔧 Pair Management Script');
  console.log('========================\n');
  console.log('Usage: npm run manage-pairs [command] [options]\n');
  console.log('Commands:');
  console.log('  list                    - List all available pairs');
  console.log('  enabled                 - List enabled pairs');
  console.log('  config <symbol>         - Show configuration for a pair');
  console.log('  validate <symbol>       - Validate pair configuration');
  console.log('  load-levels <symbol>    - Load comprehensive levels for a pair');
  console.log('  active                  - Show currently active pairs');
  console.log('  help                    - Show this help message\n');
  console.log('Examples:');
  console.log('  npm run manage-pairs list');
  console.log('  npm run manage-pairs config ADAUSDT');
  console.log('  npm run manage-pairs validate ETHUSDT');
  console.log('  npm run manage-pairs load-levels ADAUSDT\n');
}

function listAvailablePairs() {
  console.log('\n📋 Available Trading Pairs');
  console.log('===========================\n');
  
  const availablePairs = getAvailablePairs();
  const enabledPairs = getEnabledPairs();
  
  availablePairs.forEach(symbol => {
    const config = getPairConfig(symbol);
    const status = enabledPairs.includes(symbol) ? '✅ Enabled' : '❌ Disabled';
    console.log(`${symbol.padEnd(10)} - ${config?.name.padEnd(15)} ${status}`);
  });
  
  console.log(`\nTotal: ${availablePairs.length} pairs available, ${enabledPairs.length} enabled\n`);
}

function listEnabledPairs() {
  console.log('\n✅ Enabled Trading Pairs');
  console.log('========================\n');
  
  const enabledPairs = getEnabledPairs();
  
  if (enabledPairs.length === 0) {
    console.log('No pairs are currently enabled.\n');
    return;
  }
  
  enabledPairs.forEach(symbol => {
    const config = getPairConfig(symbol);
    console.log(`${symbol.padEnd(10)} - ${config?.name}`);
  });
  
  console.log(`\nTotal: ${enabledPairs.length} enabled pairs\n`);
}

function showPairConfig(symbol: string) {
  console.log(`\n⚙️  Configuration for ${symbol}`);
  console.log('='.repeat(30 + symbol.length) + '\n');
  
  const config = getPairConfig(symbol);
  
  if (!config) {
    console.log(`❌ No configuration found for ${symbol}\n`);
    return;
  }
  
  console.log(`Symbol: ${config.symbol}`);
  console.log(`Name: ${config.name}`);
  console.log(`Enabled: ${config.enabled ? '✅ Yes' : '❌ No'}`);
  console.log(`Base Balance: $${config.baseBalance}`);
  
  console.log('\n📊 Position Sizing:');
  console.log(`  Anchor Position: ${(config.positionSizing.anchorPositionSize * 100).toFixed(1)}%`);
  console.log(`  Anchor Hedge: ${(config.positionSizing.anchorHedgeSize * 100).toFixed(1)}%`);
  console.log(`  Opportunity Position: ${(config.positionSizing.opportunityPositionSize * 100).toFixed(1)}%`);
  console.log(`  Opportunity Hedge: ${(config.positionSizing.opportunityHedgeSize * 100).toFixed(1)}%`);
  console.log(`  Scalp Position: ${(config.positionSizing.scalpPositionSize * 100).toFixed(1)}%`);
  console.log(`  Scalp Hedge: ${(config.positionSizing.scalpHedgeSize * 100).toFixed(1)}%`);
  
  console.log('\n⚡ Leverage Settings:');
  console.log(`  Anchor: ${config.leverageSettings.anchorLeverage}x`);
  console.log(`  Hedge: ${config.leverageSettings.hedgeLeverage}x`);
  console.log(`  Opportunity: ${config.leverageSettings.opportunityLeverage}x`);
  console.log(`  Scalp: ${config.leverageSettings.scalpLeverage}x`);
  console.log(`  Scalp Hedge: ${config.leverageSettings.scalpHedgeLeverage}x`);
  
  console.log('\n🎯 Take Profit Percentages:');
  console.log(`  Anchor: ${config.takeProfitPercentages.anchor}%`);
  console.log(`  Opportunity: ${config.takeProfitPercentages.opportunity}%`);
  console.log(`  Scalp: ${config.takeProfitPercentages.scalp}%`);
  
  console.log('\n📈 Support/Resistance Levels:');
  console.log(`  Resistance 1: $${config.supportResistanceLevels.resistance1}`);
  console.log(`  Resistance 2: $${config.supportResistanceLevels.resistance2}`);
  console.log(`  Resistance 3: $${config.supportResistanceLevels.resistance3}`);
  console.log(`  Support 1: $${config.supportResistanceLevels.support1}`);
  console.log(`  Support 2: $${config.supportResistanceLevels.support2}`);
  console.log(`  Support 3: $${config.supportResistanceLevels.support3}`);
  
  console.log('\n🔍 Comprehensive Levels:');
  console.log(`  Source: ${config.comprehensiveLevels.source}`);
  if (config.comprehensiveLevels.filePath) {
    console.log(`  File: ${config.comprehensiveLevels.filePath}`);
  }
  
  console.log('\n🧠 Dynamic Levels:');
  console.log(`  Enabled: ${config.dynamicLevels.enabled ? '✅ Yes' : '❌ No'}`);
  console.log(`  Learning Period: ${config.dynamicLevels.learningPeriod} days`);
  console.log(`  4H Weight: ${config.dynamicLevels.timeframeWeights['4H']}`);
  console.log(`  1H Weight: ${config.dynamicLevels.timeframeWeights['1H']}`);
  console.log(`  15M Weight: ${config.dynamicLevels.timeframeWeights['15M']}`);
  
  console.log('\n⚙️  Pair Settings:');
  console.log(`  Min Order Size: $${config.settings.minOrderSize}`);
  console.log(`  Price Precision: ${config.settings.pricePrecision} decimals`);
  console.log(`  Quantity Precision: ${config.settings.quantityPrecision} decimals`);
  console.log(`  Tick Size: $${config.settings.tickSize}\n`);
}

async function validatePairConfig(symbol: string) {
  console.log(`\n🔍 Validating configuration for ${symbol}`);
  console.log('='.repeat(35 + symbol.length) + '\n');
  
  const config = getPairConfig(symbol);
  
  if (!config) {
    console.log(`❌ No configuration found for ${symbol}\n`);
    return;
  }
  
  // Validate configuration
  const errors = PairLoader.validatePairFiles(config);
  
  if (errors.length === 0) {
    console.log('✅ Configuration is valid\n');
  } else {
    console.log('❌ Configuration has errors:');
    errors.forEach(error => console.log(`  - ${error}`));
    console.log('');
  }
}

async function loadPairLevels(symbol: string) {
  console.log(`\n📊 Loading comprehensive levels for ${symbol}`);
  console.log('='.repeat(40 + symbol.length) + '\n');
  
  const config = getPairConfig(symbol);
  
  if (!config) {
    console.log(`❌ No configuration found for ${symbol}\n`);
    return;
  }
  
  try {
    const levels = await PairLoader.loadPairComprehensiveLevels(config);
    
    console.log(`✅ Successfully loaded ${levels.length} levels\n`);
    
    const resistanceLevels = levels.filter(l => l.type === 'RESISTANCE');
    const supportLevels = levels.filter(l => l.type === 'SUPPORT');
    
    console.log('📈 Resistance Levels:');
    resistanceLevels.slice(0, 10).forEach((level, index) => {
      console.log(`  ${index + 1}. $${level.price.toFixed(4)} - ${level.description} (${level.importance})`);
    });
    
    console.log('\n📉 Support Levels:');
    supportLevels.slice(0, 10).forEach((level, index) => {
      console.log(`  ${index + 1}. $${level.price.toFixed(4)} - ${level.description} (${level.importance})`);
    });
    
    console.log(`\nTotal: ${resistanceLevels.length} resistance, ${supportLevels.length} support levels\n`);
    
  } catch (error) {
    console.log(`❌ Failed to load levels: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function showActivePairs() {
  console.log('\n🎯 Currently Active Pairs');
  console.log('=========================\n');
  
  try {
    const multiPairConfig = createMultiPairConfig();
    
    if (multiPairConfig.activePairs.length === 0) {
      console.log('No pairs are currently active.\n');
      return;
    }
    
    console.log('Active pairs from environment:');
    multiPairConfig.activePairs.forEach(symbol => {
      const config = multiPairConfig.pairs.get(symbol);
      const status = config?.enabled ? '✅ Enabled' : '❌ Disabled';
      console.log(`  ${symbol.padEnd(10)} - ${config?.name.padEnd(15)} ${status}`);
    });
    
    console.log(`\nTotal: ${multiPairConfig.activePairs.length} active pairs\n`);
    
  } catch (error) {
    console.log(`❌ Error loading active pairs: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const symbol = args[1];
  
  switch (command) {
    case 'list':
      listAvailablePairs();
      break;
      
    case 'enabled':
      listEnabledPairs();
      break;
      
    case 'config':
      if (!symbol) {
        console.log('❌ Please specify a symbol: npm run manage-pairs config ADAUSDT\n');
        break;
      }
      showPairConfig(symbol.toUpperCase());
      break;
      
    case 'validate':
      if (!symbol) {
        console.log('❌ Please specify a symbol: npm run manage-pairs validate ADAUSDT\n');
        break;
      }
      await validatePairConfig(symbol.toUpperCase());
      break;
      
    case 'load-levels':
      if (!symbol) {
        console.log('❌ Please specify a symbol: npm run manage-pairs load-levels ADAUSDT\n');
        break;
      }
      await loadPairLevels(symbol.toUpperCase());
      break;
      
    case 'active':
      showActivePairs();
      break;
      
    case 'help':
    case '--help':
    case '-h':
      displayHelp();
      break;
      
    default:
      console.log('❌ Unknown command. Use "help" to see available commands.\n');
      displayHelp();
      break;
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Script error:', error);
    process.exit(1);
  });
}

export { main as managePairs };
