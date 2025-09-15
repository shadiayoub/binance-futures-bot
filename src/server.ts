import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import path from 'path';
import fs from 'fs';
import { logger } from './utils/logger';
import { BotManager } from './services/BotManager';

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.UI_PORT || 3000;
const botManager = BotManager.getInstance();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '2.0.3'
  });
});

app.get('/api/positions', async (req, res) => {
  try {
    // Get positions from all active bots
    const allBots = botManager.getBotStatus() as any[];
    const positions: any[] = [];
    let totalPnL = 0;

    for (const bot of allBots) {
      if (bot.isRunning && bot.tradingBot) {
        try {
          // Get positions from the bot's position manager
          const botPositions = await bot.tradingBot.positionManager.getPositions();
          
          // Format positions for UI with enhanced data
          const formattedPositions = botPositions.map((pos: any) => ({
            id: pos.id || `${bot.symbol}_${pos.side}_${pos.entryPrice}`,
            symbol: pos.symbol || bot.symbol,
            type: pos.type || 'ANCHOR',
            side: pos.side,
            size: pos.size || pos.quantity,
            quantity: pos.quantity || pos.size,
            leverage: pos.leverage || 1,
            entryPrice: pos.entryPrice,
            currentPrice: pos.currentPrice || pos.markPrice,
            pnl: pos.unrealizedPnl || pos.pnl || 0,
            pnlPercent: pos.unrealizedPnlPercent || pos.pnlPercent || 0,
            status: pos.status || 'OPEN',
            openTime: pos.openTime || pos.createdAt,
            closeTime: pos.closeTime,
            liquidationPrice: pos.liquidationPrice,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit
          }));

          positions.push(...formattedPositions);
          totalPnL += formattedPositions.reduce((sum: number, pos: any) => sum + pos.pnl, 0);
        } catch (error) {
          logger.error(`Failed to get positions for ${bot.symbol}`, error);
        }
      }
    }

    res.json({
      positions,
      totalPnL,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching positions', error);
    res.status(500).json({
      positions: [],
      totalPnL: 0,
      timestamp: new Date().toISOString(),
      error: 'Failed to fetch positions'
    });
  }
});

// API endpoint to close individual positions
app.post('/api/positions/close', async (req, res) => {
  try {
    const { positionId } = req.body;
    
    if (!positionId) {
      return res.status(400).json({
        success: false,
        message: 'Position ID is required'
      });
    }

    // Find the position across all bots
    const allBots = botManager.getBotStatus() as any[];
    let positionFound = false;
    let closeResult = null;

    for (const bot of allBots) {
      if (bot.isRunning && bot.tradingBot) {
        try {
          const positions = await bot.tradingBot.positionManager.getPositions();
          const position = positions.find((pos: any) => 
            pos.id === positionId || 
            `${bot.symbol}_${pos.side}_${pos.entryPrice}` === positionId
          );
          
          if (position) {
            // Close the position
            closeResult = await bot.tradingBot.positionManager.closePosition(positionId);
            positionFound = true;
            break;
          }
        } catch (error) {
          logger.error(`Failed to close position ${positionId} for ${bot.symbol}`, error);
        }
      }
    }

    if (!positionFound) {
      return res.status(404).json({
        success: false,
        message: 'Position not found'
      });
    }

    if (closeResult && closeResult.success) {
      return res.json({
        success: true,
        message: `Position ${positionId} closed successfully`,
        result: closeResult
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to close position',
        error: closeResult?.error || 'Unknown error'
      });
    }
  } catch (error) {
    logger.error('Error closing position', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to close position',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/config', (req, res) => {
  // This will return current bot configuration
  res.json({
    activePairs: ['ADAUSDT', 'ETHUSDT', 'BNBUSDT'],
    baseBalance: 1000,
    totalExposure: '76.8%',
    maxSafeExposure: '80%',
    aiEnabled: true
  });
});

// Bot Control API Endpoints
app.post('/api/bot/start', async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (symbol) {
      // Start specific bot
      const success = await botManager.startBot(symbol);
      res.json({ success, message: success ? `Bot ${symbol} started` : `Failed to start bot ${symbol}` });
    } else {
      // Start all bots
      const result = await botManager.startAllBots();
      res.json({ 
        success: result.success.length > 0, 
        message: `Started ${result.success.length} bots, ${result.failed.length} failed`,
        details: result
      });
    }
  } catch (error) {
    logger.error('Error starting bot(s)', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.post('/api/bot/stop', async (req, res) => {
  try {
    const { symbol } = req.body;
    
    if (symbol) {
      // Stop specific bot
      const success = await botManager.stopBot(symbol);
      res.json({ success, message: success ? `Bot ${symbol} stopped` : `Failed to stop bot ${symbol}` });
    } else {
      // Stop all bots
      const result = await botManager.stopAllBots();
      res.json({ 
        success: result.success.length > 0, 
        message: `Stopped ${result.success.length} bots, ${result.failed.length} failed`,
        details: result
      });
    }
  } catch (error) {
    logger.error('Error stopping bot(s)', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

app.get('/api/bot/status', (req, res) => {
  try {
    const { symbol } = req.query;
    
    if (symbol) {
      const botStatus = botManager.getBotStatus(symbol as string);
      // Clean the bot status to avoid circular references
      const cleanBotStatus = botStatus && !Array.isArray(botStatus) ? {
        id: botStatus.id,
        symbol: botStatus.symbol,
        isRunning: botStatus.isRunning,
        startTime: botStatus.startTime,
        stopTime: botStatus.stopTime
      } : null;
      res.json({ bot: cleanBotStatus });
    } else {
      const allBots = botManager.getBotStatus();
      const overallStatus = botManager.getOverallStatus();
      
      // Clean bot data to avoid circular references
      const cleanBots = Array.isArray(allBots) ? allBots.map(bot => ({
        id: bot.id,
        symbol: bot.symbol,
        isRunning: bot.isRunning,
        startTime: bot.startTime,
        stopTime: bot.stopTime
      })) : [];
      
      res.json({ 
        bots: cleanBots,
        overall: overallStatus
      });
    }
  } catch (error) {
    logger.error('Error getting bot status', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// AI Statistics Endpoint
app.get('/api/ai/stats', (req, res) => {
  try {
    const { symbol } = req.query;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol parameter is required' });
    }

    const botInstance = botManager.getBotStatus(symbol as string);
    if (!botInstance || Array.isArray(botInstance) || !botInstance.tradingBot) {
      return res.status(404).json({ error: `Bot for ${symbol} not found` });
    }

    const aiStats = botInstance.tradingBot.getAIStats();
    return res.json({
      symbol,
      ...aiStats,
      optimization: {
        batchAnalysisEnabled: true,
        intelligentCaching: true,
        circuitBreakerEnabled: true,
        costOptimizations: [
          'Reduced max_tokens from 2000 to 1000',
          'Increased cache duration from 5 to 15 minutes',
          'Implemented volatility-based caching',
          'Batch analysis reduces 4 API calls to 1',
          'Circuit breaker prevents excessive failures',
          'Increased analysis intervals'
        ]
      }
    });
  } catch (error) {
    logger.error('Error getting AI stats', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Configuration API Endpoints
app.post('/api/config/save', async (req, res) => {
  try {
    const config = req.body;
    
    // Validate required fields
    if (!config.binanceApiKey || !config.binanceSecretKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Binance API Key and Secret Key are required' 
      });
    }

    if (!config.activePairs || config.activePairs.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'At least one trading pair must be selected' 
      });
    }

    // Create .env content
    const envContent = `# Binance API Configuration
BINANCE_API_KEY=${config.binanceApiKey.replace(/•/g, '')}
BINANCE_SECRET_KEY=${config.binanceSecretKey.replace(/•/g, '')}
BINANCE_TESTNET=${config.testnet}

# Hedge API Configuration (Optional)
HEDGE_API_KEY=${(config.hedgeApiKey || '').replace(/•/g, '')}
HEDGE_SECRET_KEY=${(config.hedgeSecretKey || '').replace(/•/g, '')}
USE_DISTRIBUTED_HEDGING=${config.hedgeApiKey && !config.hedgeApiKey.includes('•') ? 'true' : 'false'}

# DeepSeek API Configuration
DEEPSEEK_API_KEY=${(config.deepseekApiKey || '').replace(/•/g, '')}
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# AI Feature Toggles
AI_ENABLE_SENTIMENT=${config.aiSentiment}
AI_ENABLE_PATTERNS=${config.aiPatterns}
AI_ENABLE_REGIME=${config.aiRegime}
AI_ENABLE_RISK=${config.aiRisk}
AI_ENABLE_CORRELATION=true

# AI Analysis Intervals (in minutes)
AI_SENTIMENT_INTERVAL=15
AI_PATTERN_INTERVAL=10
AI_REGIME_INTERVAL=30
AI_RISK_INTERVAL=20

# API Rate Limiting
AI_MAX_API_CALLS=${config.aiMaxCalls}

# Fallback Behavior
AI_FALLBACK_TO_TECHNICAL=true

# Trading Configuration
BASE_BALANCE=${config.baseBalance}
ANCHOR_LEVERAGE=${config.anchorLeverage}
HEDGE_LEVERAGE=${config.hedgeLeverage}
BASE_ANCHOR_SIZE=${config.anchorSize / 100}
BASE_HEDGE_SIZE=${config.hedgeSize / 100}

# Take Profit Settings
ANCHOR_TP_PERCENT=${config.anchorTpPercent}
OPPORTUNITY_TP_PERCENT=${config.opportunityTpPercent}
SCALP_TP_PERCENT=${config.scalpTpPercent}

# Technical Analysis Settings
RSI_PERIOD=${config.rsiPeriod}
VOLUME_PERIOD=${config.volumePeriod}
VOLUME_MULTIPLIER=${config.volumeThreshold}
EMA_FAST=${config.emaFast}
EMA_SLOW=${config.emaSlow}

# Active Trading Pairs
ACTIVE_PAIRS=${config.activePairs.join(',')}
ADA_ENABLED=${config.activePairs.includes('ADAUSDT')}
ETH_ENABLED=${config.activePairs.includes('ETHUSDT')}
BNB_ENABLED=${config.activePairs.includes('BNBUSDT')}
BTC_ENABLED=${config.activePairs.includes('BTCUSDT')}

# System Configuration
PRICE_UPDATE_INTERVAL=20
HISTORICAL_4H_DAYS=180
HISTORICAL_1H_DAYS=7
HISTORICAL_15M_DAYS=1

# Logging
LOG_LEVEL=info
LOG_FILE=logs/trading-bot.log
`;

    // Save to .env file
    fs.writeFileSync('.env', envContent);
    
    logger.info('Configuration saved successfully', { 
      activePairs: config.activePairs,
      testnet: config.testnet,
      aiEnabled: config.aiEnabled 
    });

    return res.json({ 
      success: true, 
      message: 'Configuration saved successfully. Please restart the bot to apply changes.' 
    });
  } catch (error) {
    logger.error('Error saving configuration', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to save configuration' 
    });
  }
});

app.get('/api/config/load', (req, res) => {
  try {
    if (!fs.existsSync('.env')) {
      return res.json({ 
        success: false, 
        message: 'No configuration file found' 
      });
    }

    const envContent = fs.readFileSync('.env', 'utf8');
    const config: any = {};

    // Parse .env file
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        config[key.trim()] = value.trim();
      }
    });

    // Extract configuration
    const parsedConfig = {
      binanceApiKey: config.BINANCE_API_KEY || '',
      binanceSecretKey: config.BINANCE_SECRET_KEY || '',
      hedgeApiKey: config.HEDGE_API_KEY || '',
      hedgeSecretKey: config.HEDGE_SECRET_KEY || '',
      deepseekApiKey: config.DEEPSEEK_API_KEY || '',
      baseBalance: parseFloat(config.BASE_BALANCE) || 1000,
      testnet: config.BINANCE_TESTNET === 'true',
      anchorLeverage: parseInt(config.ANCHOR_LEVERAGE) || 20,
      hedgeLeverage: parseInt(config.HEDGE_LEVERAGE) || 25,
      anchorSize: (parseFloat(config.BASE_ANCHOR_SIZE) || 0.107) * 100,
      hedgeSize: (parseFloat(config.BASE_HEDGE_SIZE) || 0.149) * 100,
      
      // Take Profit Settings
      anchorTpPercent: parseFloat(config.ANCHOR_TP_PERCENT) || 1.0,
      opportunityTpPercent: parseFloat(config.OPPORTUNITY_TP_PERCENT) || 1.0,
      scalpTpPercent: parseFloat(config.SCALP_TP_PERCENT) || 1.0,
      volumeThreshold: parseFloat(config.VOLUME_MULTIPLIER) || 0.6,
      
      // Risk Management Settings
      rsiPeriod: parseInt(config.RSI_PERIOD) || 14,
      volumePeriod: parseInt(config.VOLUME_PERIOD) || 20,
      emaFast: parseInt(config.EMA_FAST) || 9,
      emaSlow: parseInt(config.EMA_SLOW) || 18,
      
      activePairs: config.ACTIVE_PAIRS ? config.ACTIVE_PAIRS.split(',') : ['ADAUSDT'],
      aiEnabled: config.AI_ENABLE_SENTIMENT === 'true',
      aiMaxCalls: parseInt(config.AI_MAX_API_CALLS) || 50,
      aiSentiment: config.AI_ENABLE_SENTIMENT === 'true',
      aiPatterns: config.AI_ENABLE_PATTERNS === 'true',
      aiRegime: config.AI_ENABLE_REGIME === 'true',
      aiRisk: config.AI_ENABLE_RISK === 'true'
    };

    return res.json({ 
      success: true, 
      config: parsedConfig 
    });
  } catch (error) {
    logger.error('Error loading configuration', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to load configuration' 
    });
  }
});

app.post('/api/config/test', async (req, res) => {
  try {
    const { binanceApiKey, binanceSecretKey, testnet } = req.body;

    if (!binanceApiKey || !binanceSecretKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'API credentials are required' 
      });
    }

    // Test Binance API connection
    const Binance = require('binance-api-node');
    const client = Binance({
      apiKey: binanceApiKey,
      apiSecret: binanceSecretKey,
      test: testnet === 'true'
    });

    try {
      const accountInfo = await client.accountInfo();
      const balance = accountInfo.balances.find((b: any) => b.asset === 'USDT');
      
      logger.info('API connection test successful', { 
        testnet: testnet === 'true',
        balance: balance ? parseFloat(balance.free) : 0
      });

      return res.json({ 
        success: true, 
        message: 'API connection successful',
        balance: balance ? parseFloat(balance.free) : 0
      });
    } catch (apiError: any) {
      logger.error('API connection test failed', apiError);
      return res.json({ 
        success: false, 
        message: `API connection failed: ${apiError.message}` 
      });
    }
  } catch (error) {
    logger.error('Error testing API connection', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to test API connection' 
    });
  }
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info('Client connected to WebSocket', { socketId: socket.id });
  
  socket.on('disconnect', () => {
    logger.info('Client disconnected from WebSocket', { socketId: socket.id });
  });
  
  // Send initial data
  socket.emit('bot-status', {
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '2.0.3'
  });
});

// Start server
server.listen(PORT, () => {
  logger.info(`🚀 Trading Bot UI Server started on port ${PORT}`);
  logger.info(`📊 Dashboard available at: http://localhost:${PORT}`);
});

export { io };