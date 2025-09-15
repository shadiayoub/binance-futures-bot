import { AIConfig } from '../types';

/**
 * Default AI configuration
 */
export const DEFAULT_AI_CONFIG: AIConfig = {
  deepSeekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepSeekBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  enableSentimentAnalysis: process.env.AI_ENABLE_SENTIMENT === 'true',
  enablePatternRecognition: process.env.AI_ENABLE_PATTERNS === 'true',
  enableMarketRegimeDetection: process.env.AI_ENABLE_REGIME === 'true',
  enableRiskAssessment: process.env.AI_ENABLE_RISK === 'true',
  enableCorrelationAnalysis: process.env.AI_ENABLE_CORRELATION === 'true',
  sentimentAnalysisInterval: parseInt(process.env.AI_SENTIMENT_INTERVAL || '15'), // minutes
  patternRecognitionInterval: parseInt(process.env.AI_PATTERN_INTERVAL || '10'), // minutes
  marketRegimeInterval: parseInt(process.env.AI_REGIME_INTERVAL || '30'), // minutes
  riskAssessmentInterval: parseInt(process.env.AI_RISK_INTERVAL || '20'), // minutes
  maxApiCallsPerHour: parseInt(process.env.AI_MAX_API_CALLS || '50'),
  fallbackToTechnicalOnly: process.env.AI_FALLBACK_TO_TECHNICAL === 'true'
};

/**
 * Validate AI configuration
 */
export function validateAIConfig(config: AIConfig): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.deepSeekApiKey) {
    errors.push('DeepSeek API key is required');
  }

  if (!config.deepSeekBaseUrl) {
    errors.push('DeepSeek base URL is required');
  }

  if (config.maxApiCallsPerHour <= 0) {
    errors.push('Max API calls per hour must be greater than 0');
  }

  if (config.sentimentAnalysisInterval <= 0) {
    errors.push('Sentiment analysis interval must be greater than 0');
  }

  if (config.patternRecognitionInterval <= 0) {
    errors.push('Pattern recognition interval must be greater than 0');
  }

  if (config.marketRegimeInterval <= 0) {
    errors.push('Market regime interval must be greater than 0');
  }

  if (config.riskAssessmentInterval <= 0) {
    errors.push('Risk assessment interval must be greater than 0');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Get AI configuration with environment overrides
 */
export function getAIConfig(): AIConfig {
  const config = { ...DEFAULT_AI_CONFIG };
  
  // Apply environment variable overrides
  if (process.env.DEEPSEEK_API_KEY) {
    config.deepSeekApiKey = process.env.DEEPSEEK_API_KEY;
  }
  
  if (process.env.DEEPSEEK_BASE_URL) {
    config.deepSeekBaseUrl = process.env.DEEPSEEK_BASE_URL;
  }
  
  if (process.env.AI_ENABLE_SENTIMENT) {
    config.enableSentimentAnalysis = process.env.AI_ENABLE_SENTIMENT === 'true';
  }
  
  if (process.env.AI_ENABLE_PATTERNS) {
    config.enablePatternRecognition = process.env.AI_ENABLE_PATTERNS === 'true';
  }
  
  if (process.env.AI_ENABLE_REGIME) {
    config.enableMarketRegimeDetection = process.env.AI_ENABLE_REGIME === 'true';
  }
  
  if (process.env.AI_ENABLE_RISK) {
    config.enableRiskAssessment = process.env.AI_ENABLE_RISK === 'true';
  }
  
  if (process.env.AI_ENABLE_CORRELATION) {
    config.enableCorrelationAnalysis = process.env.AI_ENABLE_CORRELATION === 'true';
  }
  
  if (process.env.AI_SENTIMENT_INTERVAL) {
    config.sentimentAnalysisInterval = parseInt(process.env.AI_SENTIMENT_INTERVAL);
  }
  
  if (process.env.AI_PATTERN_INTERVAL) {
    config.patternRecognitionInterval = parseInt(process.env.AI_PATTERN_INTERVAL);
  }
  
  if (process.env.AI_REGIME_INTERVAL) {
    config.marketRegimeInterval = parseInt(process.env.AI_REGIME_INTERVAL);
  }
  
  if (process.env.AI_RISK_INTERVAL) {
    config.riskAssessmentInterval = parseInt(process.env.AI_RISK_INTERVAL);
  }
  
  if (process.env.AI_MAX_API_CALLS) {
    config.maxApiCallsPerHour = parseInt(process.env.AI_MAX_API_CALLS);
  }
  
  if (process.env.AI_FALLBACK_TO_TECHNICAL) {
    config.fallbackToTechnicalOnly = process.env.AI_FALLBACK_TO_TECHNICAL === 'true';
  }
  
  return config;
}