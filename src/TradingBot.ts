import { 
  TradingConfig, 
  PositionSizing, 
  LeverageSettings, 
  TechnicalConfig, 
  SupportResistanceLevels,
  BotState,
  TradingSignal,
  AIConfig,
  AIAnalysisResult,
  EnhancedTradingSignal
} from './types';
import { BinanceService } from './services/BinanceService';
import { TechnicalAnalysis } from './services/TechnicalAnalysis';
import { PositionManager } from './services/PositionManager';
import { HedgeStrategy } from './strategies/HedgeStrategy';
import { ScalpStrategy } from './strategies/ScalpStrategy';
import { HighFrequencyStrategy } from './strategies/HighFrequencyStrategy';
import { AIService } from './services/AIService';
import { logger } from './utils/logger';
import { BOT_VERSION, VERSION_INFO } from './config/version';
import { getAIConfig } from './config/AIConfig';
import * as cron from 'node-cron';

export class TradingBot {
  private binanceService: BinanceService;
  private technicalAnalysis: TechnicalAnalysis;
  private positionManager: PositionManager;
  private hedgeStrategy: HedgeStrategy;
  private scalpStrategy: ScalpStrategy;
  private highFrequencyStrategy: HighFrequencyStrategy;
  private aiService: AIService;
  private config: TradingConfig;
  private aiConfig: AIConfig;
  private isRunning: boolean = false;
  private heavyAnalysisJob: cron.ScheduledTask | null = null;
  private quickDecisionJob: cron.ScheduledTask | null = null;
  private lastAIAnalysis: AIAnalysisResult | null = null;

  constructor(
    config: TradingConfig,
    positionSizing: PositionSizing,
    leverageSettings: LeverageSettings,
    technicalConfig: TechnicalConfig,
    supportResistanceLevels: SupportResistanceLevels,
    aiConfig?: AIConfig
  ) {
    this.config = config;
    this.aiConfig = aiConfig || getAIConfig();
    this.binanceService = new BinanceService(config);
    this.technicalAnalysis = new TechnicalAnalysis(technicalConfig);
    this.positionManager = new PositionManager(this.binanceService, this.technicalAnalysis, positionSizing, leverageSettings);
    this.aiService = new AIService(this.aiConfig);
    this.hedgeStrategy = new HedgeStrategy(
      this.binanceService,
      this.technicalAnalysis,
      supportResistanceLevels,
      positionSizing,
      leverageSettings,
      this.positionManager.getDynamicLevels(),
      this.aiService
    );
    this.scalpStrategy = new ScalpStrategy(
      this.binanceService,
      this.technicalAnalysis,
      this.positionManager.getDynamicLevels(),
      this.positionManager,
      this.aiService
    );
    this.highFrequencyStrategy = new HighFrequencyStrategy(
      this.binanceService,
      this.technicalAnalysis,
      supportResistanceLevels,
      positionSizing,
      leverageSettings,
      this.positionManager.getDynamicLevels(),
      this.aiService
    );

    // Bot registration removed to avoid circular dependency with WebSocketService
  }

  /**
   * Initialize the trading bot
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing trading bot...');
      
      // Initialize Binance service
      await this.binanceService.initialize();
      
      // Update positions from Binance
      await this.positionManager.updatePositions();
      
      // DISABLED: Update strategy with current positions
      // this.hedgeStrategy.updatePositions(this.positionManager.getCurrentPositions());
      
      // Update high-frequency strategy with current positions (ONLY ACTIVE STRATEGY)
      this.highFrequencyStrategy.updatePositions(this.positionManager.getCurrentPositions());
      
      logger.info('Trading bot initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize trading bot', error);
      throw error;
    }
  }

  /**
   * Start the trading bot
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Trading bot is already running');
      return;
    }

    try {
      // Log version information on startup
      logger.info('🚀 ADA Futures Trading Bot Starting...', {
        version: BOT_VERSION,
        buildDate: VERSION_INFO.buildDate,
        features: VERSION_INFO.features,
        strategies: VERSION_INFO.strategies,
        safety: VERSION_INFO.safety
      });
      
      logger.info('Starting trading bot with hybrid timing system...');
      
      // WebSocket service removed for standalone operation
      
      // Heavy Analysis Loop: Every 15 minutes (market data, level learning, comprehensive analysis) - OPTIMIZED FOR COST
      this.heavyAnalysisJob = cron.schedule('*/15 * * * *', async () => {
        await this.heavyAnalysisLoop();
      }, {
        scheduled: false
      });

      // Quick Decision Loop: Every 20 seconds (entry/exit signals, hedge triggers, profit-taking)
      this.quickDecisionJob = cron.schedule('*/20 * * * * *', async () => {
        await this.quickDecisionLoop();
      }, {
        scheduled: false
      });

      this.heavyAnalysisJob.start();
      this.quickDecisionJob.start();
      
      // Start hedge monitoring
      this.positionManager.startHedgeMonitoring();
      
      this.isRunning = true;
      
      logger.info('Trading bot started successfully with hybrid timing', {
        heavyAnalysis: 'Every 2 minutes',
        quickDecisions: 'Every 20 seconds',
        hedgeMonitoring: 'Every 30 seconds'
      });
    } catch (error) {
      logger.error('Failed to start trading bot', error);
      throw error;
    }
  }

  /**
   * Stop the trading bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Trading bot is not running');
      return;
    }

    try {
      logger.info('Stopping trading bot...');
      
      if (this.heavyAnalysisJob) {
        this.heavyAnalysisJob.stop();
        this.heavyAnalysisJob = null;
      }
      
      if (this.quickDecisionJob) {
        this.quickDecisionJob.stop();
        this.quickDecisionJob = null;
      }
      
      // Stop hedge monitoring
      this.positionManager.stopHedgeMonitoring();
      
      // Cleanup Binance service resources
      this.binanceService.cleanup();
      
      this.isRunning = false;
      
      logger.info('Trading bot stopped successfully');
    } catch (error) {
      logger.error('Failed to stop trading bot', error);
      throw error;
    }
  }

  /**
   * Get real-time price for immediate decisions
   */
  async getRealTimePrice(): Promise<number> {
    try {
      // Try to get cached price first (fast)
      const cachedPrice = this.binanceService.getCachedPrice();
      if (cachedPrice !== null) {
        return cachedPrice;
      }
      
      // Fallback to API call if cache is stale
      return await this.binanceService.getCurrentPrice();
    } catch (error) {
      logger.error('Failed to get real-time price', error);
      throw error;
    }
  }

  /**
   * Heavy Analysis Loop - Every 2 minutes
   * Handles: Market data fetching, level learning, comprehensive analysis
   */
  private async heavyAnalysisLoop(): Promise<void> {
    try {
      logger.debug('Executing heavy analysis loop...');
      
      // Get real-time price for accurate decisions
      const currentPrice = await this.getRealTimePrice();
      logger.debug('Real-time price fetched for heavy analysis', { 
        price: currentPrice.toFixed(4),
        symbol: this.config.tradingPair 
      });
      
      // Update positions from Binance
      await this.positionManager.updatePositions();
      
      // DISABLED: Update strategy with current positions
      // this.hedgeStrategy.updatePositions(this.positionManager.getCurrentPositions());
      
      // Update high-frequency strategy with current positions (ONLY ACTIVE STRATEGY)
      this.highFrequencyStrategy.updatePositions(this.positionManager.getCurrentPositions());
      
      // Get market data for all timeframes
      const candles4h = this.config.historical4hDays * 6; // 4H candles per day
      const candles1h = this.config.historical1hDays * 24; // 1H candles per day
      const candles15m = this.config.historical15mDays * 96; // 15m candles per day (96 = 24*4)
      
      logger.info('Fetching historical data for level learning...', {
        '4h_days': this.config.historical4hDays,
        '1h_days': this.config.historical1hDays,
        '15m_days': this.config.historical15mDays,
        '4h_candles': candles4h,
        '1h_candles': candles1h,
        '15m_candles': candles15m
      });
      
      const marketData4h = await this.binanceService.getKlines('4h', candles4h);
      const marketData1h = await this.binanceService.getKlines('1h', candles1h);
      const marketData15m = await this.binanceService.getKlines('15m', candles15m);
      
      logger.info('Market data fetched', {
        '4h_candles': marketData4h.length,
        '1h_candles': marketData1h.length,
        '15m_candles': marketData15m.length,
        '4h_period': `${marketData4h.length / 6} days`,
        '1h_period': `${marketData1h.length / 24} days`,
        '15m_period': `${marketData15m.length / 96} days`
      });
      
      // Learn levels from all timeframes combined
      const dynamicLevels = this.positionManager.getDynamicLevels();
      dynamicLevels.learnLevelsCombined(marketData4h, marketData1h, marketData15m);
      
      // Get technical indicators for AI analysis
      const technicalIndicators = this.technicalAnalysis.getTechnicalIndicators(marketData1h);
      
      // Perform AI analysis (comprehensive analysis every heavy loop)
      logger.info('🤖 Performing AI analysis...');
      const aiAnalysis = await this.aiService.getComprehensiveAnalysis(
        this.config.tradingPair,
        marketData1h,
        technicalIndicators,
        currentPrice
      );
      
      if (aiAnalysis) {
        this.lastAIAnalysis = aiAnalysis;
        logger.info('🤖 AI analysis completed', {
          overallConfidence: aiAnalysis.overallConfidence.toFixed(3),
          tradingRecommendation: aiAnalysis.tradingRecommendation,
          sentiment: aiAnalysis.sentiment.overallSentiment,
          regime: aiAnalysis.marketRegime.regime,
          risk: aiAnalysis.riskAssessment.overallRisk,
          patternsFound: aiAnalysis.patterns.length
        });
      } else {
        logger.warn('🤖 AI analysis failed, using technical analysis only');
      }
      
      // DISABLED: Execute hedge strategy with AI insights
      // const hedgeSignals = await this.hedgeStrategy.executeStrategy(marketData4h, marketData1h, aiAnalysis);
      const hedgeSignals: any[] = []; // Empty array for disabled strategy
      
      // DISABLED: Execute scalp strategy with 15m data and AI insights
      // const scalpSignals = await this.scalpStrategy.executeScalpStrategy(marketData4h, marketData1h, marketData15m, aiAnalysis);
      const scalpSignals: any[] = []; // Empty array for disabled strategy
      
      // Execute high-frequency strategy with 15m data and AI insights (ONLY ACTIVE STRATEGY)
      logger.info('🚀 Running High-Frequency Strategy Only (Hedge, Opportunity & Scalp strategies disabled)');
      const hfSignals = await this.highFrequencyStrategy.executeStrategy(marketData4h, marketData1h, marketData15m, aiAnalysis);
      
      // Enhance signals with AI analysis (only high-frequency signals)
      const enhancedSignals = this.enhanceSignalsWithAI([...hedgeSignals, ...scalpSignals, ...hfSignals], aiAnalysis);
      
      // Execute signals
      for (const signal of enhancedSignals) {
        await this.executeSignal(signal);
      }
      
      // Log current state
      await this.logCurrentState();
      
    } catch (error) {
      logger.error('Error in heavy analysis loop', error);
    }
  }

  /**
   * Quick Decision Loop - Every 20 seconds
   * Handles: Entry/exit signals, hedge triggers, profit-taking, position management
   */
  private async quickDecisionLoop(): Promise<void> {
    try {
      logger.debug('Executing quick decision loop...');
      
      // Get real-time price for immediate decisions
      const currentPrice = await this.getRealTimePrice();
      logger.debug('Real-time price fetched for quick decisions', { 
        price: currentPrice.toFixed(4),
        symbol: this.config.tradingPair 
      });
      
      // Update positions from Binance (lightweight)
      await this.positionManager.updatePositions();
      
      // DISABLED: Update strategy with current positions
      // this.hedgeStrategy.updatePositions(this.positionManager.getCurrentPositions());
      
      // Update high-frequency strategy with current positions (ONLY ACTIVE STRATEGY)
      this.highFrequencyStrategy.updatePositions(this.positionManager.getCurrentPositions());
      
      // Get sufficient market data for quick decisions
      const marketData15m = await this.binanceService.getKlines('15m', 96); // 1 day of 15m data
      const marketData1h = await this.binanceService.getKlines('1h', 168); // 7 days of 1h data
      const marketData4h = await this.binanceService.getKlines('4h', 180); // 30 days of 4h data
      
      // Debug: Check data lengths
      logger.debug('Quick decision market data lengths', {
        marketData15m: marketData15m.length,
        marketData1h: marketData1h.length,
        marketData4h: marketData4h.length,
        minRequired: 18 // Math.max(14, 18)
      });
      
      // Skip strategy execution if insufficient data
      if (marketData4h.length < 18 || marketData1h.length < 18 || marketData15m.length < 18) {
        logger.warn('Skipping quick decision strategies - insufficient market data', {
          marketData4h: marketData4h.length,
          marketData1h: marketData1h.length,
          marketData15m: marketData15m.length,
          minRequired: 18
        });
        return;
      }
      
      // DISABLED: Execute quick decision strategies with sufficient data
      // const hedgeSignals = await this.hedgeStrategy.executeStrategy(marketData4h, marketData1h);
      // const scalpSignals = await this.scalpStrategy.executeScalpStrategy(marketData4h, marketData1h, marketData15m);
      const hedgeSignals: any[] = []; // Empty array for disabled strategy
      const scalpSignals: any[] = []; // Empty array for disabled strategy
      
      // Execute high-frequency strategy only (ONLY ACTIVE STRATEGY)
      logger.info('🚀 Running High-Frequency Strategy Only (Hedge, Opportunity & Scalp strategies disabled)');
      const hfSignals = await this.highFrequencyStrategy.executeStrategy(marketData4h, marketData1h, marketData15m);
      
      // Combine all signals (only high-frequency signals)
      const allSignals = [...hedgeSignals, ...scalpSignals, ...hfSignals];
      
      // Execute signals immediately
      for (const signal of allSignals) {
        await this.executeSignal(signal);
      }
      
      // Log current state (lightweight)
      await this.logCurrentState();
      
    } catch (error) {
      logger.error('Error in quick decision loop', error);
    }
  }

  /**
   * Enhance trading signals with AI analysis
   */
  private enhanceSignalsWithAI(signals: TradingSignal[], aiAnalysis: AIAnalysisResult | null): EnhancedTradingSignal[] {
    if (!aiAnalysis) {
      // Return signals without AI enhancement if analysis failed
      return signals.map(signal => ({
        ...signal,
        aiConfidence: 0.5,
        aiFactors: { sentiment: 0, pattern: 0, regime: 0, risk: 0 },
        aiRecommendation: 'No AI analysis available',
        originalConfidence: signal.confidence
      }));
    }

    return signals.map(signal => {
      // Calculate AI confidence based on signal type and AI analysis
      let aiConfidence = 0.5;
      let aiRecommendation = '';

      // Adjust confidence based on AI factors
      const sentimentFactor = this.getSentimentFactor(signal, aiAnalysis.sentiment);
      const patternFactor = this.getPatternFactor(signal, aiAnalysis.patterns);
      const regimeFactor = this.getRegimeFactor(signal, aiAnalysis.marketRegime);
      const riskFactor = this.getRiskFactor(signal, aiAnalysis.riskAssessment);

      aiConfidence = (sentimentFactor + patternFactor + regimeFactor + riskFactor) / 4;

      // Generate AI recommendation
      aiRecommendation = this.generateAIRecommendation(signal, aiAnalysis, aiConfidence);

      // Apply AI risk adjustments
      if (aiAnalysis.riskAssessment.overallRisk === 'EXTREME') {
        aiConfidence *= 0.3; // Severely reduce confidence in extreme risk
        aiRecommendation = 'AVOID: Extreme market risk detected';
      } else if (aiAnalysis.riskAssessment.overallRisk === 'HIGH') {
        aiConfidence *= 0.7; // Reduce confidence in high risk
      }

      return {
        ...signal,
        aiConfidence,
        aiFactors: {
          sentiment: sentimentFactor,
          pattern: patternFactor,
          regime: regimeFactor,
          risk: riskFactor
        },
        aiRecommendation,
        originalConfidence: signal.confidence
      };
    });
  }

  /**
   * Get sentiment factor for signal enhancement
   */
  private getSentimentFactor(signal: TradingSignal, sentiment: any): number {
    const sentimentScore = sentiment.sentimentScore;
    
    if (signal.position === 'LONG' && sentimentScore > 0.2) {
      return 0.8; // Bullish sentiment supports long positions
    } else if (signal.position === 'SHORT' && sentimentScore < -0.2) {
      return 0.8; // Bearish sentiment supports short positions
    } else if (signal.position === 'LONG' && sentimentScore < -0.2) {
      return 0.2; // Bearish sentiment opposes long positions
    } else if (signal.position === 'SHORT' && sentimentScore > 0.2) {
      return 0.2; // Bullish sentiment opposes short positions
    }
    
    return 0.5; // Neutral sentiment
  }

  /**
   * Get pattern factor for signal enhancement
   */
  private getPatternFactor(signal: TradingSignal, patterns: any[]): number {
    if (patterns.length === 0) return 0.5;

    let patternScore = 0;
    let totalWeight = 0;

    for (const pattern of patterns) {
      const weight = pattern.confidence * pattern.strength;
      
      if (pattern.patternType === 'BREAKOUT' && signal.type === 'ENTRY') {
        patternScore += weight * 0.8;
      } else if (pattern.patternType === 'REVERSAL' && signal.type === 'HEDGE') {
        patternScore += weight * 0.7;
      } else if (pattern.patternType === 'SUPPORT' && signal.position === 'LONG') {
        patternScore += weight * 0.6;
      } else if (pattern.patternType === 'RESISTANCE' && signal.position === 'SHORT') {
        patternScore += weight * 0.6;
      } else {
        patternScore += weight * 0.4;
      }
      
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.min(patternScore / totalWeight, 1) : 0.5;
  }

  /**
   * Get market regime factor for signal enhancement
   */
  private getRegimeFactor(signal: TradingSignal, regime: any): number {
    switch (regime.regime) {
      case 'TRENDING_BULL':
        return signal.position === 'LONG' ? 0.8 : 0.3;
      case 'TRENDING_BEAR':
        return signal.position === 'SHORT' ? 0.8 : 0.3;
      case 'RANGING':
        return signal.type === 'HEDGE' ? 0.7 : 0.5;
      case 'VOLATILE':
        return signal.type === 'HEDGE' ? 0.8 : 0.4;
      case 'CALM':
        return signal.type === 'ENTRY' ? 0.6 : 0.4;
      default:
        return 0.5;
    }
  }

  /**
   * Get risk factor for signal enhancement
   */
  private getRiskFactor(signal: TradingSignal, risk: any): number {
    const riskScore = risk.riskScore;
    
    // Higher risk generally reduces confidence, except for hedge signals
    if (signal.type === 'HEDGE') {
      return riskScore > 0.7 ? 0.8 : 0.6; // Hedges are more valuable in high risk
    } else {
      return riskScore > 0.7 ? 0.3 : 0.7; // Entries are less attractive in high risk
    }
  }

  /**
   * Generate AI recommendation for signal
   */
  private generateAIRecommendation(signal: TradingSignal, aiAnalysis: AIAnalysisResult, aiConfidence: number): string {
    const recommendation = aiAnalysis.tradingRecommendation;
    const risk = aiAnalysis.riskAssessment.overallRisk;
    
    if (risk === 'EXTREME') {
      return 'AVOID: Extreme market risk';
    }
    
    if (aiConfidence > 0.7) {
      return `STRONG: ${recommendation} - High AI confidence`;
    } else if (aiConfidence > 0.5) {
      return `MODERATE: ${recommendation} - Medium AI confidence`;
    } else {
      return `WEAK: ${recommendation} - Low AI confidence`;
    }
  }

  /**
   * Execute a trading signal
   */
  private async executeSignal(signal: TradingSignal): Promise<void> {
    try {
      logger.info('Executing signal', signal);
      
      // Check if we can execute the signal
      if (!this.canExecuteSignal(signal)) {
        logger.warn('Cannot execute signal', { signal, reason: 'Position constraints' });
        return;
      }
      
      // Execute the signal
      const position = await this.positionManager.executeSignal(signal);
      
      if (position) {
        logger.info('Signal executed successfully', { signal, position });
      } else {
        logger.warn('Failed to execute signal', signal);
      }
      
    } catch (error) {
      logger.error('Error executing signal', { signal, error });
    }
  }

  /**
   * Check if we can execute a signal
   * MODIFIED: Only allow High-Frequency signals, disable Opportunity and Anchor triggers
   */
  private canExecuteSignal(signal: TradingSignal): boolean {
    switch (signal.type) {
      case 'ENTRY':
        // Only allow High-Frequency signals (HF signals)
        if (signal.reason && signal.reason.includes('HF')) {
          // Check if we can open a HF position
          return this.positionManager.canOpenPosition('HF') || 
                 this.positionManager.canOpenPosition('SCALP') || 
                 this.positionManager.canOpenPosition('OPPORTUNITY') ||
                 this.positionManager.canOpenPosition('ANCHOR');
        }
        // Block all other entry signals (Opportunity, Anchor, Scalp)
        logger.warn('Blocking non-HF entry signal', { 
          signal: signal.reason,
          reason: 'Only High-Frequency signals allowed'
        });
        return false;
      case 'HEDGE':
        // Disable all hedge signals
        logger.warn('Blocking hedge signal', { 
          signal: signal.reason,
          reason: 'Hedge strategy disabled - HF only mode'
        });
        return false;
      case 'RE_ENTRY':
        // Disable re-entry signals (Opportunity triggers)
        logger.warn('Blocking re-entry signal', { 
          signal: signal.reason,
          reason: 'Re-entry signals disabled - HF only mode'
        });
        return false;
      case 'EXIT':
        return true; // Always allow exits
      default:
        return false;
    }
  }

  /**
   * Log current bot state
   */
  private async logCurrentState(): Promise<void> {
    try {
      logger.info('🔍 logCurrentState method called');
      const botState = this.positionManager.getBotState();
      const positionSummary = this.positionManager.getPositionSummary();
      
      // Get current support/resistance levels
      const supportLevels = this.hedgeStrategy.getSupportLevels();
      const resistanceLevels = this.hedgeStrategy.getResistanceLevels();
      
      // Get scalp trade status
      const scalpTradeStatus = this.scalpStrategy.getScalpTradeStatus();
      
      // Get current price for comprehensive analysis
      const currentPrice = await this.binanceService.getCurrentPrice();
      logger.info('🔍 Getting comprehensive info for price', { currentPrice: currentPrice.toFixed(4) });
      const comprehensiveInfo = this.hedgeStrategy.getComprehensiveLevelsInfo(currentPrice);
      
      // Safety check for comprehensiveInfo
      if (!comprehensiveInfo) {
        logger.warn('⚠️ Comprehensive info is null/undefined');
        return;
      }
    
    logger.info('Bot state update', {
      isRunning: this.isRunning,
      totalBalance: botState.totalBalance,
      availableBalance: botState.availableBalance,
      dailyPnL: botState.dailyPnL,
      weeklyPnL: botState.weeklyPnL,
      positionSummary,
      guaranteedProfit: positionSummary.breakEvenAnalysis.guaranteedProfit,
      anchorLiquidationProfit: positionSummary.breakEvenAnalysis.anchorLiquidation,
      opportunityLiquidationProfit: positionSummary.breakEvenAnalysis.opportunityLiquidation,
      currentLevels: {
        support: supportLevels.map(level => level.toFixed(4)),
        resistance: resistanceLevels.map(level => level.toFixed(4)),
        strongestSupport: supportLevels.length > 0 ? supportLevels[0]?.toFixed(4) : 'None',
        strongestResistance: resistanceLevels.length > 0 ? resistanceLevels[0]?.toFixed(4) : 'None'
      },
      comprehensiveSignals: {
        currentZone: comprehensiveInfo.currentZone?.name || 'Unknown',
        longEntry: comprehensiveInfo.longEntry ? {
          price: comprehensiveInfo.longEntry.price?.toFixed(4) || 'N/A',
          description: comprehensiveInfo.longEntry.description || 'N/A',
          importance: comprehensiveInfo.longEntry.importance || 'N/A'
        } : null,
        shortEntry: comprehensiveInfo.shortEntry ? {
          price: comprehensiveInfo.shortEntry.price?.toFixed(4) || 'N/A',
          description: comprehensiveInfo.shortEntry.description || 'N/A',
          importance: comprehensiveInfo.shortEntry.importance || 'N/A'
        } : null
      },
      scalpTrade: scalpTradeStatus,
      aiAnalysis: this.lastAIAnalysis ? {
        overallConfidence: this.lastAIAnalysis.overallConfidence.toFixed(3),
        tradingRecommendation: this.lastAIAnalysis.tradingRecommendation,
        sentiment: {
          overall: this.lastAIAnalysis.sentiment.overallSentiment,
          score: this.lastAIAnalysis.sentiment.sentimentScore.toFixed(3),
          confidence: this.lastAIAnalysis.sentiment.confidence.toFixed(3)
        },
        marketRegime: {
          regime: this.lastAIAnalysis.marketRegime.regime,
          confidence: this.lastAIAnalysis.marketRegime.confidence.toFixed(3),
          volatility: this.lastAIAnalysis.marketRegime.volatility.toFixed(3),
          trendStrength: this.lastAIAnalysis.marketRegime.trendStrength.toFixed(3)
        },
        riskAssessment: {
          overallRisk: this.lastAIAnalysis.riskAssessment.overallRisk,
          riskScore: this.lastAIAnalysis.riskAssessment.riskScore.toFixed(3),
          recommendations: {
            positionSize: this.lastAIAnalysis.riskAssessment.recommendations.positionSize.toFixed(2),
            leverage: this.lastAIAnalysis.riskAssessment.recommendations.leverage.toFixed(2),
            hedgeRatio: this.lastAIAnalysis.riskAssessment.recommendations.hedgeRatio.toFixed(2),
            entryDelay: this.lastAIAnalysis.riskAssessment.recommendations.entryDelay
          }
        },
        patternsFound: this.lastAIAnalysis.patterns.length,
        correlations: this.lastAIAnalysis.correlations.length,
        timestamp: this.lastAIAnalysis.timestamp.toISOString()
      } : null
    });
    } catch (error) {
      logger.error('Error in logCurrentState', error);
    }
  }

  /**
   * Get current bot state
   */
  getBotState(): BotState {
    return this.positionManager.getBotState();
  }

  /**
   * Get current positions
   */
  getCurrentPositions() {
    return this.positionManager.getCurrentPositions();
  }

  /**
   * Get position summary
   */
  getPositionSummary() {
    return this.positionManager.getPositionSummary();
  }

  /**
   * Check if bot is running
   */
  isBotRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Emergency stop - close all positions
   */
  async emergencyStop(): Promise<void> {
    try {
      logger.warn('Emergency stop initiated - closing all positions');
      
      const positions = this.positionManager.getCurrentPositions();
      const openPositions = positions.filter(pos => pos.status === 'OPEN');
      
      for (const position of openPositions) {
        try {
          await this.binanceService.closePosition(position);
          position.status = 'CLOSED';
          position.closeTime = new Date();
          logger.info('Emergency closed position', position);
        } catch (error) {
          logger.error('Failed to emergency close position', { position, error });
        }
      }
      
      // Stop the bot
      await this.stop();
      
      logger.warn('Emergency stop completed');
    } catch (error) {
      logger.error('Error during emergency stop', error);
    }
  }

  /**
   * Get trading statistics
   */
  getTradingStats(): {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    totalPnL: number;
    averageWin: number;
    averageLoss: number;
  } {
    const positions = this.positionManager.getCurrentPositions();
    const closedPositions = positions.filter(pos => pos.status === 'CLOSED' && pos.pnl !== undefined);
    
    const winningTrades = closedPositions.filter(pos => (pos.pnl || 0) > 0);
    const losingTrades = closedPositions.filter(pos => (pos.pnl || 0) < 0);
    
    const totalPnL = closedPositions.reduce((total, pos) => total + (pos.pnl || 0), 0);
    const averageWin = winningTrades.length > 0 ? 
      winningTrades.reduce((total, pos) => total + (pos.pnl || 0), 0) / winningTrades.length : 0;
    const averageLoss = losingTrades.length > 0 ? 
      losingTrades.reduce((total, pos) => total + (pos.pnl || 0), 0) / losingTrades.length : 0;
    
    return {
      totalTrades: closedPositions.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedPositions.length > 0 ? winningTrades.length / closedPositions.length : 0,
      totalPnL,
      averageWin,
      averageLoss
    };
  }

  /**
   * Get current AI analysis
   */
  getCurrentAIAnalysis(): AIAnalysisResult | null {
    return this.lastAIAnalysis;
  }

  /**
   * Get AI service statistics
   */
  getAIStats(): { apiUsage: any; cacheSize: number } {
    return {
      apiUsage: this.aiService.getApiUsageStats(),
      cacheSize: 0 // Cache size would need to be exposed from AIService
    };
  }

  /**
   * Clear AI cache
   */
  clearAICache(): void {
    this.aiService.clearCache();
    logger.info('AI cache cleared');
  }
}
