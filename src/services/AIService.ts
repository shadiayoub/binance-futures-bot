import axios from 'axios';
import { 
  AIConfig, 
  AIAnalysisResult, 
  SentimentData, 
  PatternData, 
  MarketRegimeData, 
  RiskAssessmentData, 
  CorrelationData,
  MarketData,
  TechnicalIndicators
} from '../types';
import { logger } from '../utils/logger';

export class AIService {
  private config: AIConfig;
  private apiCallCount: number = 0;
  private lastApiReset: Date = new Date();
  private cache: Map<string, { data: any; timestamp: Date; volatility?: number }> = new Map();
  private readonly CACHE_DURATION = 15 * 60 * 1000; // 15 minutes (increased from 5)
  private readonly HIGH_VOLATILITY_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes for high volatility
  
  // Circuit breaker pattern for API failures
  private consecutiveFailures: number = 0;
  private lastFailureTime: Date | null = null;
  private readonly MAX_CONSECUTIVE_FAILURES = 3;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 10 * 60 * 1000; // 10 minutes

  constructor(config: AIConfig) {
    this.config = config;
  }

  /**
   * Check if circuit breaker is open (too many failures)
   */
  private isCircuitBreakerOpen(): boolean {
    if (this.consecutiveFailures < this.MAX_CONSECUTIVE_FAILURES) {
      return false;
    }
    
    if (this.lastFailureTime && 
        (Date.now() - this.lastFailureTime.getTime()) > this.CIRCUIT_BREAKER_TIMEOUT) {
      // Reset circuit breaker after timeout
      this.consecutiveFailures = 0;
      this.lastFailureTime = null;
      logger.info('🔧 Circuit breaker reset - API calls resumed');
      return false;
    }
    
    return true;
  }

  /**
   * Record API call success
   */
  private recordApiSuccess(): void {
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }

  /**
   * Record API call failure
   */
  private recordApiFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = new Date();
    
    if (this.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      logger.warn('🔧 Circuit breaker opened - API calls suspended', {
        consecutiveFailures: this.consecutiveFailures,
        timeoutMinutes: this.CIRCUIT_BREAKER_TIMEOUT / (1000 * 60)
      });
    }
  }

  /**
   * Calculate market volatility for intelligent caching
   */
  private calculateVolatility(marketData: MarketData[]): number {
    if (marketData.length < 2) return 0;
    
    const prices = marketData.slice(-20).map(data => data.price); // Last 20 data points
    const returns = [];
    
    for (let i = 1; i < prices.length; i++) {
      const currentPrice = prices[i];
      const previousPrice = prices[i-1];
      if (currentPrice !== undefined && previousPrice !== undefined && previousPrice !== 0) {
        returns.push((currentPrice - previousPrice) / previousPrice);
      }
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100; // Return as percentage
  }

  /**
   * Main method to get comprehensive AI analysis
   */
  async getComprehensiveAnalysis(
    symbol: string,
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators,
    currentPrice: number
  ): Promise<AIAnalysisResult | null> {
    try {
      // Calculate market volatility for intelligent caching
      const volatility = this.calculateVolatility(marketData);
      const isHighVolatility = volatility > 2.0; // 2% volatility threshold
      
      // Check cache with volatility-based duration
      const cacheKey = `${symbol}_comprehensive`;
      const cached = this.cache.get(cacheKey);
      const cacheDuration = isHighVolatility ? this.HIGH_VOLATILITY_CACHE_DURATION : this.CACHE_DURATION;
      
      if (cached && (Date.now() - cached.timestamp.getTime()) < cacheDuration) {
        logger.info('🤖 Using cached AI analysis', { 
          symbol, 
          volatility: volatility.toFixed(2) + '%',
          cacheAge: Math.round((Date.now() - cached.timestamp.getTime()) / 1000) + 's'
        });
        return cached.data;
      }

      if (!this.canMakeApiCall()) {
        logger.warn('AI API call limit reached, using cached data or fallback');
        return this.getCachedAnalysis(symbol) || null;
      }

      if (this.isCircuitBreakerOpen()) {
        logger.warn('🔧 Circuit breaker is open - using cached data or fallback');
        return this.getCachedAnalysis(symbol) || null;
      }

      logger.info('🤖 Starting comprehensive AI analysis', { 
        symbol, 
        currentPrice, 
        volatility: volatility.toFixed(2) + '%',
        isHighVolatility 
      });

      // Use batch analysis to reduce API calls from 4 to 1
      const batchAnalysis = await this.getBatchAnalysis(symbol, marketData, technicalIndicators, currentPrice);
      
      // Extract individual components from batch analysis
      const sentimentData = batchAnalysis.sentiment || this.getDefaultSentiment();
      const patternData = batchAnalysis.patterns || [];
      const regimeData = batchAnalysis.marketRegime || this.getDefaultMarketRegime();
      const riskData = batchAnalysis.riskAssessment || this.getDefaultRiskAssessment();
      const correlationData = batchAnalysis.correlations || [];

      // Calculate overall confidence and trading recommendation
      const overallConfidence = this.calculateOverallConfidence(
        sentimentData,
        patternData,
        regimeData,
        riskData
      );

      const tradingRecommendation = this.generateTradingRecommendation(
        sentimentData,
        patternData,
        regimeData,
        riskData,
        overallConfidence
      );

      const result: AIAnalysisResult = {
        sentiment: sentimentData,
        patterns: patternData,
        marketRegime: regimeData,
        riskAssessment: riskData,
        correlations: correlationData,
        overallConfidence,
        tradingRecommendation,
        timestamp: new Date()
      };

      // Cache the result with volatility information
      this.cache.set(cacheKey, { data: result, timestamp: new Date(), volatility });

      logger.info('🤖 AI analysis completed', {
        symbol,
        overallConfidence: overallConfidence.toFixed(3),
        tradingRecommendation,
        sentiment: sentimentData.overallSentiment,
        regime: regimeData.regime,
        risk: riskData.overallRisk
      });

      return result;

    } catch (error) {
      logger.error('Error in comprehensive AI analysis', error);
      return this.config.fallbackToTechnicalOnly ? null : this.getCachedAnalysis(symbol);
    }
  }

  /**
   * Get batch analysis combining all AI analyses into a single API call
   */
  private async getBatchAnalysis(
    symbol: string,
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators,
    currentPrice: number
  ): Promise<any> {
    const cacheKey = `${symbol}_batch`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp.getTime()) < this.CACHE_DURATION) {
      return cached.data;
    }

    const recentData = marketData.slice(-50); // Last 50 data points
    const priceData = recentData.map(data => ({
      timestamp: data.timestamp,
      price: data.price,
      volume: data.volume
    }));

    const prompt = `
    Analyze ${symbol} comprehensively. Provide ALL analyses in a single JSON response:

    1. SENTIMENT ANALYSIS:
    - Analyze market sentiment based on price action, volume, and technical indicators
    - Consider: bullish/bearish momentum, market psychology, trend strength
    - Return: sentiment (BULLISH/BEARISH/NEUTRAL), confidence (0-1), reasoning

    2. PATTERN RECOGNITION:
    - Identify chart patterns: support/resistance levels, trend lines, chart patterns
    - Look for: triangles, flags, head & shoulders, double tops/bottoms, etc.
    - Return: array of patterns with type, strength, price levels

    3. MARKET REGIME DETECTION:
    - Determine current market regime: trending, ranging, volatile, consolidation
    - Analyze: trend direction, volatility, momentum, market structure
    - Return: regime (TRENDING_UP/TRENDING_DOWN/RANGING/VOLATILE), confidence, characteristics

    4. RISK ASSESSMENT:
    - Evaluate market risk factors: volatility, liquidity, correlation risks
    - Consider: position sizing, stop losses, market conditions
    - Return: overallRisk (LOW/MEDIUM/HIGH), riskFactors array, recommendations

    5. CORRELATION ANALYSIS:
    - Analyze correlations with major assets (BTC, ETH, market indices)
    - Return: correlations array with asset, correlation strength, significance

    Current Data:
    - Symbol: ${symbol}
    - Current Price: ${currentPrice}
    - Recent Price Data: ${JSON.stringify(priceData.slice(-10))}
    - Technical Indicators: RSI=${technicalIndicators.rsi?.toFixed(2)}, EMA_Fast=${technicalIndicators.emaFast?.toFixed(2)}, EMA_Slow=${technicalIndicators.emaSlow?.toFixed(2)}

    Respond with JSON format containing all five analyses:
    {
      "sentiment": { "sentiment": "BULLISH", "confidence": 0.75, "reasoning": "..." },
      "patterns": [{ "patternType": "SUPPORT", "strength": 0.8, "priceLevel": 0.45 }],
      "marketRegime": { "regime": "TRENDING_UP", "confidence": 0.7, "characteristics": "..." },
      "riskAssessment": { "overallRisk": "MEDIUM", "riskFactors": ["..."], "recommendations": "..." },
      "correlations": [{ "asset": "BTC", "correlation": 0.8, "significance": "HIGH" }]
    }
    `;

    const response = await this.callDeepSeekAPI(prompt);
    
    // Cache the batch result
    this.cache.set(cacheKey, { data: response, timestamp: new Date() });
    
    return response;
  }

  /**
   * Get sentiment analysis using DeepSeek API
   */
  private async getSentimentAnalysis(symbol: string): Promise<SentimentData> {
    if (!this.config.enableSentimentAnalysis) {
      return this.getDefaultSentiment();
    }

    try {
      const cacheKey = `sentiment_${symbol}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      // Gather market news and social sentiment data
      const newsData = await this.gatherNewsData(symbol);
      const socialData = await this.gatherSocialData(symbol);

      const prompt = `
        Analyze the sentiment for ${symbol} cryptocurrency based on the following data:
        
        News Headlines: ${newsData.headlines.join(', ')}
        Social Media Mentions: ${socialData.mentions.join(', ')}
        
        Please provide:
        1. Overall sentiment (BULLISH/BEARISH/NEUTRAL)
        2. Sentiment score (-1 to 1, where -1 is very bearish, 1 is very bullish)
        3. Confidence level (0 to 1)
        4. Key events or factors driving sentiment
        5. Breakdown by source (news, social, analyst)
        
        Respond in JSON format.
      `;

      const response = await this.callDeepSeekAPI(prompt);
      
      const sentimentData: SentimentData = {
        overallSentiment: response.sentiment || 'NEUTRAL',
        sentimentScore: response.sentimentScore || 0,
        confidence: response.confidence || 0.5,
        sources: {
          news: response.sources?.news || 0,
          social: response.sources?.social || 0,
          analyst: response.sources?.analyst || 0
        },
        keyEvents: response.keyEvents || [],
        timestamp: new Date()
      };

      this.cache.set(cacheKey, { data: sentimentData, timestamp: new Date() });
      return sentimentData;

    } catch (error) {
      logger.error('Error in sentiment analysis', error);
      return this.getDefaultSentiment();
    }
  }

  /**
   * Get pattern recognition analysis
   */
  private async getPatternRecognition(
    symbol: string, 
    marketData: MarketData[], 
    currentPrice: number
  ): Promise<PatternData[]> {
    if (!this.config.enablePatternRecognition) {
      return [];
    }

    try {
      const cacheKey = `patterns_${symbol}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      // Prepare price data for pattern analysis
      const priceData = marketData.map(d => ({
        price: d.price,
        volume: d.volume,
        timestamp: d.timestamp.toISOString()
      }));

      const prompt = `
        Analyze the following price data for ${symbol} and identify technical patterns:
        
        Price Data: ${JSON.stringify(priceData.slice(-50))} // Last 50 data points
        Current Price: ${currentPrice}
        
        Look for:
        1. Support and resistance levels
        2. Chart patterns (triangles, flags, head & shoulders, etc.)
        3. Breakout patterns
        4. Reversal patterns
        5. Continuation patterns
        
        For each pattern found, provide:
        - Pattern type (SUPPORT/RESISTANCE/BREAKOUT/REVERSAL/CONTINUATION)
        - Pattern name
        - Confidence (0 to 1)
        - Strength (0 to 1)
        - Price level
        - Timeframe
        - Description
        
        Respond in JSON format with an array of patterns.
      `;

      const response = await this.callDeepSeekAPI(prompt);
      
      const patterns: PatternData[] = (response.patterns || []).map((p: any) => ({
        patternType: p.patternType || 'SUPPORT',
        patternName: p.patternName || 'Unknown Pattern',
        confidence: p.confidence || 0.5,
        strength: p.strength || 0.5,
        priceLevel: p.priceLevel || currentPrice,
        timeframe: p.timeframe || '1H',
        description: p.description || 'Pattern detected',
        timestamp: new Date()
      }));

      this.cache.set(cacheKey, { data: patterns, timestamp: new Date() });
      return patterns;

    } catch (error) {
      logger.error('Error in pattern recognition', error);
      return [];
    }
  }

  /**
   * Get market regime detection
   */
  private async getMarketRegimeDetection(
    symbol: string,
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators
  ): Promise<MarketRegimeData> {
    if (!this.config.enableMarketRegimeDetection) {
      return this.getDefaultMarketRegime();
    }

    try {
      const cacheKey = `regime_${symbol}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      const prompt = `
        Analyze the market regime for ${symbol} based on:
        
        Technical Indicators:
        - RSI: ${technicalIndicators.rsi}
        - EMA Fast: ${technicalIndicators.emaFast}
        - EMA Slow: ${technicalIndicators.emaSlow}
        - Trend: ${technicalIndicators.trend}
        - Volume Ratio: ${technicalIndicators.volumeRatio}
        - VWAP Distance: ${technicalIndicators.vwapDistance}%
        
        Recent Price Data: ${JSON.stringify(marketData.slice(-20).map(d => ({ price: d.price, volume: d.volume })))}
        
        Determine:
        1. Market regime (TRENDING_BULL/TRENDING_BEAR/RANGING/VOLATILE/CALM)
        2. Confidence level (0 to 1)
        3. Volatility level (0 to 1)
        4. Trend strength (0 to 1)
        5. Market phase (ACCUMULATION/MARKUP/DISTRIBUTION/MARKDOWN)
        6. Expected duration in hours
        
        Respond in JSON format.
      `;

      const response = await this.callDeepSeekAPI(prompt);
      
      const regimeData: MarketRegimeData = {
        regime: response.regime || 'RANGING',
        confidence: response.confidence || 0.5,
        volatility: response.volatility || 0.5,
        trendStrength: response.trendStrength || 0.5,
        marketPhase: response.marketPhase || 'ACCUMULATION',
        expectedDuration: response.expectedDuration || 24,
        timestamp: new Date()
      };

      this.cache.set(cacheKey, { data: regimeData, timestamp: new Date() });
      return regimeData;

    } catch (error) {
      logger.error('Error in market regime detection', error);
      return this.getDefaultMarketRegime();
    }
  }

  /**
   * Get risk assessment
   */
  private async getRiskAssessment(
    symbol: string,
    marketData: MarketData[],
    technicalIndicators: TechnicalIndicators,
    currentPrice: number
  ): Promise<RiskAssessmentData> {
    if (!this.config.enableRiskAssessment) {
      return this.getDefaultRiskAssessment();
    }

    try {
      const cacheKey = `risk_${symbol}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      const prompt = `
        Assess the trading risk for ${symbol} based on:
        
        Current Price: ${currentPrice}
        Technical Indicators: ${JSON.stringify(technicalIndicators)}
        Recent Volatility: ${this.calculateVolatility(marketData)}
        
        Provide:
        1. Overall risk level (LOW/MEDIUM/HIGH/EXTREME)
        2. Risk score (0 to 1)
        3. Risk factors breakdown:
           - Volatility (0 to 1)
           - Correlation (0 to 1)
           - Liquidity (0 to 1)
           - Sentiment (0 to 1)
           - Technical (0 to 1)
        4. Recommendations:
           - Position size multiplier (0.5 to 1.5)
           - Leverage multiplier (0.5 to 1.5)
           - Hedge ratio multiplier (0.8 to 1.2)
           - Entry delay in minutes
        
        Respond in JSON format.
      `;

      const response = await this.callDeepSeekAPI(prompt);
      
      const riskData: RiskAssessmentData = {
        overallRisk: response.overallRisk || 'MEDIUM',
        riskScore: response.riskScore || 0.5,
        factors: {
          volatility: response.factors?.volatility || 0.5,
          correlation: response.factors?.correlation || 0.5,
          liquidity: response.factors?.liquidity || 0.5,
          sentiment: response.factors?.sentiment || 0.5,
          technical: response.factors?.technical || 0.5
        },
        recommendations: {
          positionSize: response.recommendations?.positionSize || 1.0,
          leverage: response.recommendations?.leverage || 1.0,
          hedgeRatio: response.recommendations?.hedgeRatio || 1.0,
          entryDelay: response.recommendations?.entryDelay || 0
        },
        timestamp: new Date()
      };

      this.cache.set(cacheKey, { data: riskData, timestamp: new Date() });
      return riskData;

    } catch (error) {
      logger.error('Error in risk assessment', error);
      return this.getDefaultRiskAssessment();
    }
  }

  /**
   * Get correlation analysis
   */
  private async getCorrelationAnalysis(symbol: string, marketData: MarketData[]): Promise<CorrelationData[]> {
    if (!this.config.enableCorrelationAnalysis) {
      return [];
    }

    try {
      const cacheKey = `correlation_${symbol}`;
      const cached = this.getCachedData(cacheKey);
      if (cached) return cached;

      // For now, return basic correlation data
      // In a full implementation, you'd analyze correlations with BTC, ETH, etc.
      const correlations: CorrelationData[] = [
        {
          asset: 'BTCUSDT',
          correlation: 0.75,
          significance: 0.8,
          trend: 'STABLE',
          impact: 'POSITIVE',
          timestamp: new Date()
        },
        {
          asset: 'ETHUSDT',
          correlation: 0.65,
          significance: 0.7,
          trend: 'INCREASING',
          impact: 'POSITIVE',
          timestamp: new Date()
        }
      ];

      this.cache.set(cacheKey, { data: correlations, timestamp: new Date() });
      return correlations;

    } catch (error) {
      logger.error('Error in correlation analysis', error);
      return [];
    }
  }

  /**
   * Call DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.config.deepSeekBaseUrl}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages: [
            {
              role: 'system',
              content: 'You are an expert cryptocurrency trading analyst. Provide accurate, data-driven analysis in JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 1000 // Reduced from 2000 to save costs
        },
        {
          headers: {
            'Authorization': `Bearer ${this.config.deepSeekApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      this.apiCallCount++;
      this.recordApiSuccess(); // Record successful API call
      
      // Parse the response
      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('No content in API response');
      }

      // Try to parse as JSON directly first
      try {
        return JSON.parse(content);
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from markdown or other formats
        const parsedResponse = this.parseTextResponse(content);
        if (parsedResponse && typeof parsedResponse === 'object' && parsedResponse !== null) {
          return parsedResponse;
        }
        logger.warn('Failed to parse AI response as JSON, using fallback', { content });
        return this.parseTextResponse(content);
      }

    } catch (error) {
      this.recordApiFailure(); // Record failed API call
      logger.error('DeepSeek API call failed', error);
      throw error;
    }
  }

  /**
   * Parse text response when JSON parsing fails
   */
  private parseTextResponse(content: string): any {
    // First, try to extract JSON from markdown code blocks
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        logger.info('Successfully parsed JSON from markdown code block');
        return parsed;
      } catch (parseError) {
        logger.warn('Failed to parse extracted JSON from markdown', { extractedJson: jsonMatch[1] });
      }
    }

    // Try to find JSON object in the content without markdown
    const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        const parsed = JSON.parse(jsonObjectMatch[0]);
        logger.info('Successfully parsed JSON object from content');
        return parsed;
      } catch (parseError) {
        logger.warn('Failed to parse JSON object from content', { jsonObject: jsonObjectMatch[0] });
      }
    }

    // Fallback to simple text parsing
    const bullishKeywords = ['bullish', 'positive', 'upward', 'buy', 'strong'];
    const bearishKeywords = ['bearish', 'negative', 'downward', 'sell', 'weak'];
    
    const lowerContent = content.toLowerCase();
    const bullishCount = bullishKeywords.filter(keyword => lowerContent.includes(keyword)).length;
    const bearishCount = bearishKeywords.filter(keyword => lowerContent.includes(keyword)).length;
    
    return {
      sentiment: bullishCount > bearishCount ? 'BULLISH' : bearishCount > bullishCount ? 'BEARISH' : 'NEUTRAL',
      sentimentScore: bullishCount > bearishCount ? 0.3 : bearishCount > bullishCount ? -0.3 : 0,
      confidence: 0.5,
      regime: 'RANGING',
      overallRisk: 'MEDIUM',
      riskScore: 0.5
    };
  }

  /**
   * Gather news data (placeholder implementation)
   */
  private async gatherNewsData(symbol: string): Promise<{ headlines: string[] }> {
    // In a real implementation, you'd fetch from news APIs
    return {
      headlines: [
        `${symbol} shows strong technical indicators`,
        `Market sentiment improving for ${symbol}`,
        `Analysts bullish on ${symbol} prospects`
      ]
    };
  }

  /**
   * Gather social media data (placeholder implementation)
   */
  private async gatherSocialData(symbol: string): Promise<{ mentions: string[] }> {
    // In a real implementation, you'd fetch from social media APIs
    return {
      mentions: [
        `${symbol} trending on Twitter`,
        `Positive sentiment on Reddit for ${symbol}`,
        `Community optimistic about ${symbol}`
      ]
    };
  }


  /**
   * Calculate overall confidence from all AI factors
   */
  private calculateOverallConfidence(
    sentiment: SentimentData,
    patterns: PatternData[],
    regime: MarketRegimeData,
    risk: RiskAssessmentData
  ): number {
    const sentimentWeight = 0.3;
    const patternWeight = 0.25;
    const regimeWeight = 0.25;
    const riskWeight = 0.2;

    const sentimentConfidence = sentiment.confidence;
    const patternConfidence = patterns.length > 0 ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length : 0.5;
    const regimeConfidence = regime.confidence;
    const riskConfidence = 1 - risk.riskScore; // Lower risk = higher confidence

    return (
      sentimentConfidence * sentimentWeight +
      patternConfidence * patternWeight +
      regimeConfidence * regimeWeight +
      riskConfidence * riskWeight
    );
  }

  /**
   * Generate trading recommendation based on AI analysis
   */
  private generateTradingRecommendation(
    sentiment: SentimentData,
    patterns: PatternData[],
    regime: MarketRegimeData,
    risk: RiskAssessmentData,
    overallConfidence: number
  ): 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL' | 'AVOID' {
    
    if (risk.overallRisk === 'EXTREME') {
      return 'AVOID';
    }

    const sentimentScore = sentiment.sentimentScore;
    const regimeScore = regime.regime === 'TRENDING_BULL' ? 1 : 
                      regime.regime === 'TRENDING_BEAR' ? -1 : 0;
    
    const patternScore = patterns.length > 0 ? 
      patterns.reduce((sum, p) => {
        const score = p.patternType === 'BREAKOUT' ? 0.5 : 
                     p.patternType === 'REVERSAL' ? -0.3 : 0;
        return sum + score * p.confidence;
      }, 0) / patterns.length : 0;

    const combinedScore = (sentimentScore + regimeScore + patternScore) / 3;

    if (overallConfidence < 0.3) return 'HOLD';
    if (combinedScore > 0.5) return overallConfidence > 0.7 ? 'STRONG_BUY' : 'BUY';
    if (combinedScore < -0.5) return overallConfidence > 0.7 ? 'STRONG_SELL' : 'SELL';
    return 'HOLD';
  }

  /**
   * Check if we can make an API call
   */
  private canMakeApiCall(): boolean {
    const now = new Date();
    const hoursSinceReset = (now.getTime() - this.lastApiReset.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceReset >= 1) {
      this.apiCallCount = 0;
      this.lastApiReset = now;
    }
    
    return this.apiCallCount < this.config.maxApiCallsPerHour;
  }

  /**
   * Get cached data if available and not expired
   */
  private getCachedData(key: string): any {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    const age = new Date().getTime() - cached.timestamp.getTime();
    if (age > this.CACHE_DURATION) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  /**
   * Get cached analysis result
   */
  private getCachedAnalysis(symbol: string): AIAnalysisResult | null {
    return this.getCachedData(`analysis_${symbol}`);
  }

  /**
   * Default sentiment data
   */
  private getDefaultSentiment(): SentimentData {
    return {
      overallSentiment: 'NEUTRAL',
      sentimentScore: 0,
      confidence: 0.5,
      sources: { news: 0, social: 0, analyst: 0 },
      keyEvents: [],
      timestamp: new Date()
    };
  }

  /**
   * Default market regime data
   */
  private getDefaultMarketRegime(): MarketRegimeData {
    return {
      regime: 'RANGING',
      confidence: 0.5,
      volatility: 0.5,
      trendStrength: 0.5,
      marketPhase: 'ACCUMULATION',
      expectedDuration: 24,
      timestamp: new Date()
    };
  }

  /**
   * Default risk assessment data
   */
  private getDefaultRiskAssessment(): RiskAssessmentData {
    return {
      overallRisk: 'MEDIUM',
      riskScore: 0.5,
      factors: {
        volatility: 0.5,
        correlation: 0.5,
        liquidity: 0.5,
        sentiment: 0.5,
        technical: 0.5
      },
      recommendations: {
        positionSize: 1.0,
        leverage: 1.0,
        hedgeRatio: 1.0,
        entryDelay: 0
      },
      timestamp: new Date()
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('AI service cache cleared');
  }

  /**
   * Get API usage statistics
   */
  getApiUsageStats(): { 
    callsThisHour: number; 
    maxCallsPerHour: number; 
    resetTime: Date;
    circuitBreakerOpen: boolean;
    consecutiveFailures: number;
    lastFailureTime: Date | null;
  } {
    return {
      callsThisHour: this.apiCallCount,
      maxCallsPerHour: this.config.maxApiCallsPerHour,
      resetTime: this.lastApiReset,
      circuitBreakerOpen: this.isCircuitBreakerOpen(),
      consecutiveFailures: this.consecutiveFailures,
      lastFailureTime: this.lastFailureTime
    };
  }
}