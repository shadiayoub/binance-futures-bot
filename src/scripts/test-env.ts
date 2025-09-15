import dotenv from 'dotenv';
import { getAIConfig } from '../config/AIConfig';

// Load environment variables
dotenv.config();

console.log('🔍 Environment Variables Test');
console.log('=====================================');

console.log('DEEPSEEK_API_KEY:', process.env.DEEPSEEK_API_KEY ? '✅ Set' : '❌ Not set');
console.log('DEEPSEEK_BASE_URL:', process.env.DEEPSEEK_BASE_URL || 'Not set');
console.log('AI_ENABLE_SENTIMENT:', process.env.AI_ENABLE_SENTIMENT || 'Not set');
console.log('AI_ENABLE_PATTERNS:', process.env.AI_ENABLE_PATTERNS || 'Not set');
console.log('AI_ENABLE_REGIME:', process.env.AI_ENABLE_REGIME || 'Not set');
console.log('AI_ENABLE_RISK:', process.env.AI_ENABLE_RISK || 'Not set');
console.log('AI_ENABLE_CORRELATION:', process.env.AI_ENABLE_CORRELATION || 'Not set');

console.log('\n🤖 AI Configuration Test');
console.log('=====================================');

try {
  const aiConfig = getAIConfig();
  console.log('AI Config loaded successfully:');
  console.log('- DeepSeek API Key:', aiConfig.deepSeekApiKey ? '✅ Set' : '❌ Not set');
  console.log('- DeepSeek Base URL:', aiConfig.deepSeekBaseUrl);
  console.log('- Enable Sentiment:', aiConfig.enableSentimentAnalysis);
  console.log('- Enable Patterns:', aiConfig.enablePatternRecognition);
  console.log('- Enable Regime:', aiConfig.enableMarketRegimeDetection);
  console.log('- Enable Risk:', aiConfig.enableRiskAssessment);
  console.log('- Enable Correlation:', aiConfig.enableCorrelationAnalysis);
  console.log('- Max API Calls:', aiConfig.maxApiCallsPerHour);
  console.log('- Fallback to Technical:', aiConfig.fallbackToTechnicalOnly);
} catch (error) {
  console.error('❌ Error loading AI config:', error);
}

console.log('\n📋 All Environment Variables (AI-related)');
console.log('=====================================');
Object.keys(process.env)
  .filter(key => key.includes('AI') || key.includes('DEEPSEEK'))
  .forEach(key => {
    console.log(`${key}: ${process.env[key]}`);
  });