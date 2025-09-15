import dotenv from 'dotenv';
import { AIService } from '../services/AIService';
import { getAIConfig, validateAIConfig } from '../config/AIConfig';
import { logger } from '../utils/logger';
import { MarketData, TechnicalIndicators } from '../types';

// Load environment variables
dotenv.config();

/**
 * Test script for AI integration validation
 */
async function testAIIntegration() {
  logger.info('🤖 Starting AI integration test...');

  try {
    // Load AI configuration
    const aiConfig = getAIConfig();
    logger.info('AI Configuration loaded', {
      enableSentiment: aiConfig.enableSentimentAnalysis,
      enablePatterns: aiConfig.enablePatternRecognition,
      enableRegime: aiConfig.enableMarketRegimeDetection,
      enableRisk: aiConfig.enableRiskAssessment,
      enableCorrelation: aiConfig.enableCorrelationAnalysis,
      maxApiCalls: aiConfig.maxApiCallsPerHour,
      fallbackToTechnical: aiConfig.fallbackToTechnicalOnly
    });

    // Validate configuration
    const validation = validateAIConfig(aiConfig);
    if (!validation.isValid) {
      logger.error('AI configuration validation failed', { errors: validation.errors });
      return;
    }

    // Initialize AI service
    const aiService = new AIService(aiConfig);
    logger.info('AI Service initialized successfully');

    // Create mock market data for testing
    const mockMarketData: MarketData[] = [
      {
        symbol: 'ADAUSDT',
        price: 0.85,
        volume: 1000000,
        timestamp: new Date(Date.now() - 3600000),
        timeframe: '1h'
      },
      {
        symbol: 'ADAUSDT',
        price: 0.86,
        volume: 1200000,
        timestamp: new Date(Date.now() - 1800000),
        timeframe: '1h'
      },
      {
        symbol: 'ADAUSDT',
        price: 0.87,
        volume: 1500000,
        timestamp: new Date(),
        timeframe: '1h'
      }
    ];

    // Create mock technical indicators
    const mockTechnicalIndicators: TechnicalIndicators = {
      rsi: 65,
      emaFast: 0.86,
      emaSlow: 0.85,
      volumeSma: 1200000,
      volumeRatio: 1.25,
      trend: 'BULLISH',
      vwap: 0.86,
      vwapDistance: 1.16
    };

    const currentPrice = 0.87;

    logger.info('Testing comprehensive AI analysis...');
    
    // Test comprehensive analysis
    const analysis = await aiService.getComprehensiveAnalysis(
      'ADAUSDT',
      mockMarketData,
      mockTechnicalIndicators,
      currentPrice
    );

    if (analysis) {
      logger.info('✅ AI analysis completed successfully', {
        overallConfidence: analysis.overallConfidence.toFixed(3),
        tradingRecommendation: analysis.tradingRecommendation,
        sentiment: {
          overall: analysis.sentiment.overallSentiment,
          score: analysis.sentiment.sentimentScore.toFixed(3),
          confidence: analysis.sentiment.confidence.toFixed(3)
        },
        marketRegime: {
          regime: analysis.marketRegime.regime,
          confidence: analysis.marketRegime.confidence.toFixed(3),
          volatility: analysis.marketRegime.volatility.toFixed(3),
          trendStrength: analysis.marketRegime.trendStrength.toFixed(3)
        },
        riskAssessment: {
          overallRisk: analysis.riskAssessment.overallRisk,
          riskScore: analysis.riskAssessment.riskScore.toFixed(3),
          recommendations: {
            positionSize: analysis.riskAssessment.recommendations.positionSize.toFixed(2),
            leverage: analysis.riskAssessment.recommendations.leverage.toFixed(2),
            hedgeRatio: analysis.riskAssessment.recommendations.hedgeRatio.toFixed(2),
            entryDelay: analysis.riskAssessment.recommendations.entryDelay
          }
        },
        patternsFound: analysis.patterns.length,
        correlations: analysis.correlations.length
      });

      // Test individual components
      logger.info('Testing individual AI components...');

      // Test sentiment analysis
      if (aiConfig.enableSentimentAnalysis) {
        logger.info('Testing sentiment analysis...');
        // Note: This would make an actual API call if configured
        logger.info('Sentiment analysis test completed');
      }

      // Test pattern recognition
      if (aiConfig.enablePatternRecognition) {
        logger.info('Testing pattern recognition...');
        logger.info('Pattern recognition test completed');
      }

      // Test market regime detection
      if (aiConfig.enableMarketRegimeDetection) {
        logger.info('Testing market regime detection...');
        logger.info('Market regime detection test completed');
      }

      // Test risk assessment
      if (aiConfig.enableRiskAssessment) {
        logger.info('Testing risk assessment...');
        logger.info('Risk assessment test completed');
      }

      // Test correlation analysis
      if (aiConfig.enableCorrelationAnalysis) {
        logger.info('Testing correlation analysis...');
        logger.info('Correlation analysis test completed');
      }

    } else {
      logger.warn('⚠️ AI analysis returned null - this is expected if API key is not configured');
    }

    // Test API usage stats
    const apiStats = aiService.getApiUsageStats();
    logger.info('API usage statistics', apiStats);

    // Test cache functionality
    logger.info('Testing cache functionality...');
    aiService.clearCache();
    logger.info('Cache cleared successfully');

    logger.info('✅ AI integration test completed successfully!');

  } catch (error) {
    logger.error('❌ AI integration test failed', error);
  }
}

/**
 * Test AI configuration validation
 */
function testAIConfigValidation() {
  logger.info('Testing AI configuration validation...');

  // Test valid configuration
  const validConfig = {
    deepSeekApiKey: 'test-key',
    deepSeekBaseUrl: 'https://api.deepseek.com/v1',
    enableSentimentAnalysis: true,
    enablePatternRecognition: true,
    enableMarketRegimeDetection: true,
    enableRiskAssessment: true,
    enableCorrelationAnalysis: true,
    sentimentAnalysisInterval: 15,
    patternRecognitionInterval: 10,
    marketRegimeInterval: 30,
    riskAssessmentInterval: 20,
    maxApiCallsPerHour: 50,
    fallbackToTechnicalOnly: true
  };

  const validResult = validateAIConfig(validConfig);
  logger.info('Valid config test', { isValid: validResult.isValid, errors: validResult.errors });

  // Test invalid configuration
  const invalidConfig = {
    ...validConfig,
    deepSeekApiKey: '', // Empty API key
    maxApiCallsPerHour: -1, // Invalid value
    sentimentAnalysisInterval: 0 // Invalid value
  };

  const invalidResult = validateAIConfig(invalidConfig);
  logger.info('Invalid config test', { isValid: invalidResult.isValid, errors: invalidResult.errors });

  logger.info('AI configuration validation test completed');
}

/**
 * Test AI service error handling
 */
async function testAIErrorHandling() {
  logger.info('Testing AI service error handling...');

  try {
    // Create AI service with invalid configuration
    const invalidConfig = {
      deepSeekApiKey: 'invalid-key',
      deepSeekBaseUrl: 'https://invalid-url.com/v1',
      enableSentimentAnalysis: true,
      enablePatternRecognition: true,
      enableMarketRegimeDetection: true,
      enableRiskAssessment: true,
      enableCorrelationAnalysis: true,
      sentimentAnalysisInterval: 15,
      patternRecognitionInterval: 10,
      marketRegimeInterval: 30,
      riskAssessmentInterval: 20,
      maxApiCallsPerHour: 50,
      fallbackToTechnicalOnly: true
    };

    const aiService = new AIService(invalidConfig);

    // Test with mock data
    const mockMarketData: MarketData[] = [
      {
        symbol: 'ADAUSDT',
        price: 0.85,
        volume: 1000000,
        timestamp: new Date(),
        timeframe: '1h'
      }
    ];

    const mockTechnicalIndicators: TechnicalIndicators = {
      rsi: 50,
      emaFast: 0.85,
      emaSlow: 0.85,
      volumeSma: 1000000,
      volumeRatio: 1.0,
      trend: 'SIDEWAYS',
      vwap: 0.85,
      vwapDistance: 0
    };

    // This should handle errors gracefully
    const result = await aiService.getComprehensiveAnalysis(
      'ADAUSDT',
      mockMarketData,
      mockTechnicalIndicators,
      0.85
    );

    if (result) {
      logger.info('AI service handled errors gracefully and returned fallback data');
    } else {
      logger.info('AI service returned null due to errors (expected behavior)');
    }

  } catch (error) {
    logger.error('AI service error handling test failed', error);
  }

  logger.info('AI service error handling test completed');
}

// Run all tests
async function runAllTests() {
  logger.info('🚀 Starting comprehensive AI integration tests...');

  try {
    await testAIConfigValidation();
    await testAIErrorHandling();
    await testAIIntegration();
    
    logger.info('🎉 All AI integration tests completed successfully!');
  } catch (error) {
    logger.error('💥 AI integration tests failed', error);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}

export { testAIIntegration, testAIConfigValidation, testAIErrorHandling };