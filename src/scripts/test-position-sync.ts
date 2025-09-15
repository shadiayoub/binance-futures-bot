#!/usr/bin/env ts-node

/**
 * Test script for Position Sync JSON file functionality
 * This script demonstrates how the position sync file works
 */

import { DistributedHedgeService } from '../services/DistributedHedgeService';
import { BinanceService } from '../services/BinanceService';
import { Position } from '../types';
import { logger } from '../utils/logger';

// Mock configuration for testing
const mockConfig = {
  apiKey: 'test-api-key',
  secretKey: 'test-secret-key',
  testnet: true,
  tradingPair: 'ADAUSDT',
  baseBalance: 1000,
  riskPerTrade: 0.02,
  historical4hDays: 180,
  historical1hDays: 7,
  historical15mDays: 1,
  priceUpdateInterval: 20
};

async function testPositionSync() {
  try {
    logger.info('🧪 Testing Position Sync JSON File Functionality');
    
    // Create mock BinanceService
    const binanceService = new BinanceService(mockConfig);
    
    // Create DistributedHedgeService
    const distributedHedgeService = new DistributedHedgeService(binanceService);
    
    // Create mock positions
    const mockPrimaryPositions: Position[] = [
      {
        id: 'primary-123',
        symbol: 'ADAUSDT',
        side: 'LONG',
        size: 1000,
        leverage: 10,
        entryPrice: 0.45,
        pnl: 2.22,
        type: 'ANCHOR',
        status: 'OPEN',
        openTime: new Date(),
        quantity: 1000,
        liquidationPrice: 0.40
      }
    ];
    
    const mockHedgePositions: Position[] = [
      {
        id: 'hedge-456',
        symbol: 'ADAUSDT',
        side: 'SHORT',
        size: 1500,
        leverage: 20,
        entryPrice: 0.47,
        pnl: -2.13,
        type: 'ANCHOR_HEDGE',
        status: 'OPEN',
        openTime: new Date(),
        quantity: 1500,
        liquidationPrice: 0.50
      }
    ];
    
    // Test position sync
    logger.info('📝 Writing mock positions to sync file...');
    
    // Manually call the sync method (normally called by getAllPositions)
    const fs = require('fs');
    const path = require('path');
    
    const syncData = {
      timestamp: new Date().toISOString(),
      primaryPositions: mockPrimaryPositions.map(pos => ({
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
      hedgePositions: mockHedgePositions.map(pos => ({
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
    
    const syncFilePath = path.join(process.cwd(), 'position-sync.json');
    fs.writeFileSync(syncFilePath, JSON.stringify(syncData, null, 2));
    
    logger.info('✅ Position sync file written successfully', {
      syncFilePath,
      primaryPositions: mockPrimaryPositions.length,
      hedgePositions: mockHedgePositions.length
    });
    
    // Test reading the sync file
    logger.info('📖 Reading position sync file...');
    const readData = distributedHedgeService.readPositionSyncFile();
    
    if (readData) {
      logger.info('✅ Position sync file read successfully', {
        timestamp: readData.timestamp,
        primaryPositions: readData.primaryPositions?.length || 0,
        hedgePositions: readData.hedgePositions?.length || 0
      });
      
      // Display the data
      console.log('\n📊 Position Sync Data:');
      console.log('='.repeat(50));
      console.log(`Timestamp: ${readData.timestamp}`);
      console.log(`Primary Positions: ${readData.primaryPositions?.length || 0}`);
      console.log(`Hedge Positions: ${readData.hedgePositions?.length || 0}`);
      
      if (readData.primaryPositions?.length > 0) {
        console.log('\n🎯 Primary Positions:');
        readData.primaryPositions.forEach((pos: any, index: number) => {
          console.log(`  ${index + 1}. ${pos.symbol} ${pos.side} ${pos.type} (${pos.apiKey})`);
          console.log(`     Size: ${pos.size}, Leverage: ${pos.leverage}x, Entry: $${pos.entryPrice}`);
        });
      }
      
      if (readData.hedgePositions?.length > 0) {
        console.log('\n🛡️ Hedge Positions:');
        readData.hedgePositions.forEach((pos: any, index: number) => {
          console.log(`  ${index + 1}. ${pos.symbol} ${pos.side} ${pos.type} (${pos.apiKey})`);
          console.log(`     Size: ${pos.size}, Leverage: ${pos.leverage}x, Entry: $${pos.entryPrice}`);
        });
      }
      
      console.log('\n' + '='.repeat(50));
    }
    
    // Cleanup
    distributedHedgeService.cleanup();
    
    logger.info('🎉 Position sync test completed successfully!');
    
  } catch (error) {
    logger.error('❌ Position sync test failed', error);
  }
}

// Run the test
if (require.main === module) {
  testPositionSync().catch(console.error);
}

export { testPositionSync };
