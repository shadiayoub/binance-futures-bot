#!/usr/bin/env npx tsx

/**
 * Show Multi-Pair Sizing Recommendations
 * Displays optimal position sizing for different numbers of active pairs
 */

import { MultiPairSizingService } from '../services/MultiPairSizingService';
import { logger } from '../utils/logger';

async function showSizingRecommendations() {
  try {
    console.log('🎯 Multi-Pair Sizing Recommendations\n');
    
    const sizingService = new MultiPairSizingService();
    const recommendations = sizingService.getSizingRecommendations();
    
    // Show recommendations for different pair counts
    console.log('📊 Optimal Sizing by Number of Pairs:\n');
    
    for (let numPairs = 1; numPairs <= 5; numPairs++) {
      const pairs = Array(numPairs).fill(0).map((_, i) => `PAIR${i + 1}USDT`);
      const result = sizingService.calculateOptimalSizing(pairs);
      
      console.log(`🔹 ${numPairs} Pair${numPairs > 1 ? 's' : ''}:`);
      console.log(`   ${recommendations[numPairs]}`);
      console.log(`   Anchor: ${(result.positionSizing.anchorPositionSize * 100).toFixed(1)}%`);
      console.log(`   Hedge:  ${(result.positionSizing.anchorHedgeSize * 100).toFixed(1)}%`);
      console.log(`   Total:  ${(result.totalExposure * 100).toFixed(1)}% exposure`);
      console.log(`   Status: ${result.totalExposure <= 0.80 ? '✅ SAFE' : '⚠️ UNSAFE'}`);
      console.log('');
    }
    
    // Show current environment configuration
    console.log('🔧 Current Environment Configuration:\n');
    
    const activePairs = process.env.ACTIVE_PAIRS?.split(',').map(p => p.trim()) || [];
    
    if (activePairs.length === 0) {
      console.log('   No ACTIVE_PAIRS configured');
      console.log('   Set ACTIVE_PAIRS environment variable to see current sizing');
    } else {
      const result = sizingService.calculateOptimalSizing(activePairs);
      const validation = sizingService.validateConfiguration(activePairs, result.positionSizing);
      
      console.log(`   Active Pairs: ${activePairs.join(', ')}`);
      console.log(`   Number of Pairs: ${activePairs.length}`);
      console.log(`   Scaling Factor: ${result.scalingFactor.toFixed(3)}`);
      console.log(`   Total Exposure: ${(result.totalExposure * 100).toFixed(1)}%`);
      console.log(`   Safety Status: ${validation.isSafe ? '✅ SAFE' : '⚠️ UNSAFE'}`);
      console.log(`   Recommendation: ${result.recommendation}`);
      console.log('');
      
      // Show detailed breakdown
      console.log('📋 Detailed Breakdown:');
      console.log(sizingService.getDetailedBreakdown(activePairs, result.positionSizing));
    }
    
    // Show safety guidelines
    console.log('\n🛡️ Safety Guidelines:\n');
    console.log('   • Maximum safe total exposure: 80% of balance');
    console.log('   • 1-2 pairs: Use original sizing (20%/30% per pair)');
    console.log('   • 3+ pairs: Automatic scaling to maintain safety');
    console.log('   • Each hedge guarantees profit for its anchor position');
    console.log('   • Diversification reduces overall risk');
    
    console.log('\n✅ Sizing recommendations displayed successfully');
    
  } catch (error) {
    console.error('❌ Error showing sizing recommendations:', error);
    process.exit(1);
  }
}

// Run the script
showSizingRecommendations();
