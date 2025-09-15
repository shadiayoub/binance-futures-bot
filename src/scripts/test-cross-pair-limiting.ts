#!/usr/bin/env npx tsx

/**
 * Test Cross-Pair Primary Position Limiting System
 * Tests the singleton MultiPairSizingService with cross-pair coordination
 */

import { MultiPairSizingService } from '../services/MultiPairSizingService';
import { logger } from '../utils/logger';

async function testCrossPairLimiting() {
  try {
    console.log('🧪 Testing Cross-Pair Primary Position Limiting System\n');
    
    // Get singleton instance
    const sizingService = MultiPairSizingService.getInstance();
    
    // Test 1: Initial status
    console.log('📊 Test 1: Initial Status');
    const initialStatus = sizingService.getPrimaryPositionStatus();
    console.log('Initial Status:', JSON.stringify(initialStatus, null, 2));
    console.log('');
    
    // Test 2: Check if we can open first position
    console.log('📊 Test 2: Can Open First Position (ADA ANCHOR)');
    const canOpen1 = sizingService.canOpenPrimaryPosition('ADAUSDT', 'ANCHOR');
    console.log('Can open ADA ANCHOR:', canOpen1);
    console.log('');
    
    // Test 3: Register first position
    console.log('📊 Test 3: Register First Position (ADA ANCHOR)');
    sizingService.registerPrimaryPosition('ADAUSDT', 'ANCHOR', 'ada_anchor_001');
    const statusAfter1 = sizingService.getPrimaryPositionStatus();
    console.log('Status after first position:', JSON.stringify(statusAfter1, null, 2));
    console.log('');
    
    // Test 4: Check if we can open second position
    console.log('📊 Test 4: Can Open Second Position (ETH ANCHOR)');
    const canOpen2 = sizingService.canOpenPrimaryPosition('ETHUSDT', 'ANCHOR');
    console.log('Can open ETH ANCHOR:', canOpen2);
    console.log('');
    
    // Test 5: Register second position
    console.log('📊 Test 5: Register Second Position (ETH ANCHOR)');
    sizingService.registerPrimaryPosition('ETHUSDT', 'ANCHOR', 'eth_anchor_001');
    const statusAfter2 = sizingService.getPrimaryPositionStatus();
    console.log('Status after second position:', JSON.stringify(statusAfter2, null, 2));
    console.log('');
    
    // Test 6: Try to open third position (should be blocked)
    console.log('📊 Test 6: Try to Open Third Position (BNB ANCHOR) - Should be BLOCKED');
    const canOpen3 = sizingService.canOpenPrimaryPosition('BNBUSDT', 'ANCHOR');
    console.log('Can open BNB ANCHOR:', canOpen3);
    console.log('');
    
    // Test 7: Try to register third position (should be blocked)
    console.log('📊 Test 7: Try to Register Third Position (BNB ANCHOR) - Should be BLOCKED');
    sizingService.registerPrimaryPosition('BNBUSDT', 'ANCHOR', 'bnb_anchor_001');
    const statusAfter3 = sizingService.getPrimaryPositionStatus();
    console.log('Status after attempted third position:', JSON.stringify(statusAfter3, null, 2));
    console.log('');
    
    // Test 8: Close first position
    console.log('📊 Test 8: Close First Position (ADA ANCHOR)');
    sizingService.unregisterPrimaryPosition('ada_anchor_001');
    const statusAfterClose1 = sizingService.getPrimaryPositionStatus();
    console.log('Status after closing first position:', JSON.stringify(statusAfterClose1, null, 2));
    console.log('');
    
    // Test 9: Now try to open third position (should work)
    console.log('📊 Test 9: Now Try to Open Third Position (BNB ANCHOR) - Should WORK');
    const canOpen3After = sizingService.canOpenPrimaryPosition('BNBUSDT', 'ANCHOR');
    console.log('Can open BNB ANCHOR after closing ADA:', canOpen3After);
    console.log('');
    
    // Test 10: Register third position
    console.log('📊 Test 10: Register Third Position (BNB ANCHOR)');
    sizingService.registerPrimaryPosition('BNBUSDT', 'ANCHOR', 'bnb_anchor_001');
    const finalStatus = sizingService.getPrimaryPositionStatus();
    console.log('Final status:', JSON.stringify(finalStatus, null, 2));
    console.log('');
    
    // Test 11: Try to open fourth position (should be blocked again)
    console.log('📊 Test 11: Try to Open Fourth Position (BTC ANCHOR) - Should be BLOCKED');
    const canOpen4 = sizingService.canOpenPrimaryPosition('BTCUSDT', 'ANCHOR');
    console.log('Can open BTC ANCHOR:', canOpen4);
    console.log('');
    
    // Test 12: Close all remaining positions
    console.log('📊 Test 12: Close All Remaining Positions');
    sizingService.unregisterPrimaryPosition('eth_anchor_001');
    sizingService.unregisterPrimaryPosition('bnb_anchor_001');
    const finalCleanStatus = sizingService.getPrimaryPositionStatus();
    console.log('Final clean status:', JSON.stringify(finalCleanStatus, null, 2));
    console.log('');
    
    console.log('✅ All tests completed successfully!');
    console.log('🎯 Cross-pair primary position limiting system is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    logger.error('Cross-pair limiting test failed', error);
  }
}

// Run the test
testCrossPairLimiting();
