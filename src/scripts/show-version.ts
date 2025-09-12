#!/usr/bin/env ts-node

/**
 * Show Bot Version Script
 * Displays current version and build information
 */

import { BOT_VERSION, VERSION_INFO } from '../config/version';
import { logger } from '../utils/logger';

function displayVersion() {
  console.log('\n🚀 ADA Futures Trading Bot');
  console.log('=====================================');
  console.log(`Version: ${BOT_VERSION}`);
  console.log(`Build Date: ${new Date(VERSION_INFO.buildDate).toLocaleString()}`);
  console.log(`Node Version: ${process.version}`);
  console.log(`Platform: ${process.platform} ${process.arch}`);
  
  console.log('\n📋 Features:');
  VERSION_INFO.features.forEach((feature, index) => {
    console.log(`  ${index + 1}. ${feature}`);
  });
  
  console.log('\n🎯 Strategies:');
  VERSION_INFO.strategies.forEach((strategy, index) => {
    console.log(`  ${index + 1}. ${strategy}`);
  });
  
  console.log('\n🛡️ Safety Features:');
  VERSION_INFO.safety.forEach((safety, index) => {
    console.log(`  ${index + 1}. ${safety}`);
  });
  
  console.log('\n=====================================\n');
}

// Run the script
if (require.main === module) {
  displayVersion();
}

export { displayVersion };
