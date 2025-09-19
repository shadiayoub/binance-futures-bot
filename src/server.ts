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

// Script Execution Endpoints
app.get('/api/scripts/levels', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '../scripts/show-levels.js');
    
    return exec(`node "${scriptPath}"`, { timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error('Error executing show-levels script', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to execute levels script',
          details: error.message 
        });
      }
      
      if (stderr) {
        logger.warn('Script stderr', stderr);
      }
      
      // Parse the output to extract structured data
      const lines = stdout.split('\n');
      const result: any = {
        success: true,
        timestamp: new Date().toISOString(),
        currentPrice: null as number | null,
        supportLevels: [] as any[],
        resistanceLevels: [] as any[],
        staticLevels: {} as any,
        levelStats: {} as any,
        nearestSupport: null as any,
        nearestResistance: null as any,
        rawOutput: stdout
      };
      
      let currentSection = '';
      let currentPriceMatch = stdout.match(/CURRENT ADA PRICE: \$([0-9.]+)/);
      if (currentPriceMatch && currentPriceMatch[1]) {
        result.currentPrice = parseFloat(currentPriceMatch[1]);
      }
      
      // Parse resistance levels
      const resistanceMatch = stdout.match(/RESISTANCE LEVELS[^]*?(?=SUPPORT LEVELS|STATIC LEVELS|$)/s);
      if (resistanceMatch) {
        const resistanceLines = resistanceMatch[0].split('\n');
        resistanceLines.forEach(line => {
          const match = line.match(/\d+\. \$([0-9.]+) \(Strength: ([0-9.]+), Touches: (\d+)\)/);
          if (match && match[1] && match[2] && match[3]) {
            result.resistanceLevels.push({
              price: parseFloat(match[1]),
              strength: parseFloat(match[2]),
              touches: parseInt(match[3])
            });
          }
        });
      }
      
      // Parse support levels
      const supportMatch = stdout.match(/SUPPORT LEVELS[^]*?(?=STATIC LEVELS|LEVEL STATISTICS|$)/s);
      if (supportMatch) {
        const supportLines = supportMatch[0].split('\n');
        supportLines.forEach(line => {
          const match = line.match(/\d+\. \$([0-9.]+) \(Strength: ([0-9.]+), Touches: (\d+)\)/);
          if (match && match[1] && match[2] && match[3]) {
            result.supportLevels.push({
              price: parseFloat(match[1]),
              strength: parseFloat(match[2]),
              touches: parseInt(match[3])
            });
          }
        });
      }
      
      // Parse static levels
      const staticMatch = stdout.match(/STATIC LEVELS[^]*?(?=LEVEL STATISTICS|$)/s);
      if (staticMatch) {
        const staticLines = staticMatch[0].split('\n');
        staticLines.forEach(line => {
          const resistanceMatch = line.match(/Resistance (\d+): \$([0-9.]+)/);
          const supportMatch = line.match(/Support (\d+):\s+\$([0-9.]+)/);
          
          if (resistanceMatch && resistanceMatch[1] && resistanceMatch[2]) {
            result.staticLevels[`resistance${resistanceMatch[1]}`] = parseFloat(resistanceMatch[2]);
          }
          if (supportMatch && supportMatch[1] && supportMatch[2]) {
            result.staticLevels[`support${supportMatch[1]}`] = parseFloat(supportMatch[2]);
          }
        });
      }
      
      // Parse nearest levels
      const nearestSupportMatch = stdout.match(/Nearest Support: \$([0-9.]+) \(([0-9.]+)% below\)/);
      if (nearestSupportMatch && nearestSupportMatch[1] && nearestSupportMatch[2]) {
        result.nearestSupport = {
          price: parseFloat(nearestSupportMatch[1]),
          distance: parseFloat(nearestSupportMatch[2])
        };
      }
      
      const nearestResistanceMatch = stdout.match(/Nearest Resistance: \$([0-9.]+) \(([0-9.]+)% above\)/);
      if (nearestResistanceMatch && nearestResistanceMatch[1] && nearestResistanceMatch[2]) {
        result.nearestResistance = {
          price: parseFloat(nearestResistanceMatch[1]),
          distance: parseFloat(nearestResistanceMatch[2])
        };
      }
      
      return res.json(result);
    });
  } catch (error) {
    logger.error('Error in levels endpoint', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/scripts/comprehensive-levels', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '../scripts/show-comprehensive-levels.js');
    
    return exec(`node "${scriptPath}"`, { timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error('Error executing comprehensive-levels script', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to execute comprehensive levels script',
          details: error.message 
        });
      }
      
      if (stderr) {
        logger.warn('Script stderr', stderr);
      }
      
      // Parse the comprehensive output
      const result: any = {
        success: true,
        timestamp: new Date().toISOString(),
        currentPrice: null as number | null,
        currentZone: null as string | null,
        tradingSignals: {
          longEntry: null as any,
          shortEntry: null as any,
          nearestResistance: null as any,
          nearestSupport: null as any
        },
        criticalLevels: {
          resistance: [] as any[],
          support: [] as any[]
        },
        highImportanceLevels: {
          resistance: [] as any[],
          support: [] as any[]
        },
        zoneBreakdown: {} as any,
        statistics: {} as any,
        rawOutput: stdout
      };
      
      // Parse current price
      const currentPriceMatch = stdout.match(/CURRENT ADA PRICE: \$([0-9.]+)/);
      if (currentPriceMatch && currentPriceMatch[1]) {
        result.currentPrice = parseFloat(currentPriceMatch[1]);
      }
      
      // Parse current zone
      const currentZoneMatch = stdout.match(/CURRENT ZONE: ([A-Z\s]+)/);
      if (currentZoneMatch && currentZoneMatch[1]) {
        result.currentZone = currentZoneMatch[1].trim();
      }
      
      // Parse trading signals
      const longEntryMatch = stdout.match(/LONG Entry Signal:[^]*?Price: \$([0-9.]+) \(([0-9.]+)% above current\)[^]*?Description: ([^]*?)\n[^]*?Importance: ([^]*?)\n[^]*?Zone: ([^]*?)\n/s);
      if (longEntryMatch && longEntryMatch[1] && longEntryMatch[2] && longEntryMatch[3] && longEntryMatch[4] && longEntryMatch[5]) {
        result.tradingSignals.longEntry = {
          price: parseFloat(longEntryMatch[1]),
          distance: parseFloat(longEntryMatch[2]),
          description: longEntryMatch[3].trim(),
          importance: longEntryMatch[4].trim(),
          zone: longEntryMatch[5].trim()
        };
      }
      
      const shortEntryMatch = stdout.match(/SHORT Entry Signal:[^]*?Price: \$([0-9.]+) \(([0-9.]+)% below current\)[^]*?Description: ([^]*?)\n[^]*?Importance: ([^]*?)\n[^]*?Zone: ([^]*?)\n/s);
      if (shortEntryMatch && shortEntryMatch[1] && shortEntryMatch[2] && shortEntryMatch[3] && shortEntryMatch[4] && shortEntryMatch[5]) {
        result.tradingSignals.shortEntry = {
          price: parseFloat(shortEntryMatch[1]),
          distance: parseFloat(shortEntryMatch[2]),
          description: shortEntryMatch[3].trim(),
          importance: shortEntryMatch[4].trim(),
          zone: shortEntryMatch[5].trim()
        };
      }
      
      // Parse nearest levels
      const nearestResistanceMatch = stdout.match(/Nearest Resistance: \$([0-9.]+) \(([0-9.]+)% above\)[^]*?Description: ([^]*?)\n/s);
      if (nearestResistanceMatch && nearestResistanceMatch[1] && nearestResistanceMatch[2] && nearestResistanceMatch[3]) {
        result.tradingSignals.nearestResistance = {
          price: parseFloat(nearestResistanceMatch[1]),
          distance: parseFloat(nearestResistanceMatch[2]),
          description: nearestResistanceMatch[3].trim()
        };
      }
      
      const nearestSupportMatch = stdout.match(/Nearest Support: \$([0-9.]+) \(([0-9.]+)% below\)[^]*?Description: ([^]*?)\n/s);
      if (nearestSupportMatch && nearestSupportMatch[1] && nearestSupportMatch[2] && nearestSupportMatch[3]) {
        result.tradingSignals.nearestSupport = {
          price: parseFloat(nearestSupportMatch[1]),
          distance: parseFloat(nearestSupportMatch[2]),
          description: nearestSupportMatch[3].trim()
        };
      }
      
      // Parse critical levels
      const criticalResistanceMatch = stdout.match(/Critical Resistance Levels:[^]*?(?=Critical Support Levels:|$)/s);
      if (criticalResistanceMatch) {
        const lines = criticalResistanceMatch[0].split('\n');
        lines.forEach(line => {
          const match = line.match(/\$([0-9.]+) \(([0-9.]+)% above\) - ([^]*?) \[([^\]]+)\]/);
          if (match && match[1] && match[2] && match[3] && match[4]) {
            result.criticalLevels.resistance.push({
              price: parseFloat(match[1]),
              distance: parseFloat(match[2]),
              description: match[3].trim(),
              zone: match[4].trim()
            });
          }
        });
      }
      
      const criticalSupportMatch = stdout.match(/Critical Support Levels:[^]*?(?=HIGH IMPORTANCE LEVELS:|$)/s);
      if (criticalSupportMatch) {
        const lines = criticalSupportMatch[0].split('\n');
        lines.forEach(line => {
          const match = line.match(/\$([0-9.]+) \(([0-9.]+)% below\) - ([^]*?) \[([^\]]+)\]/);
          if (match && match[1] && match[2] && match[3] && match[4]) {
            result.criticalLevels.support.push({
              price: parseFloat(match[1]),
              distance: parseFloat(match[2]),
              description: match[3].trim(),
              zone: match[4].trim()
            });
          }
        });
      }
      
      // Parse statistics
      const totalLevelsMatch = stdout.match(/Total Levels: (\d+)/);
      const resistanceLevelsMatch = stdout.match(/Resistance Levels: (\d+)/);
      const supportLevelsMatch = stdout.match(/Support Levels: (\d+)/);
      const criticalLevelsMatch = stdout.match(/Critical Levels: (\d+)/);
      const highImportanceMatch = stdout.match(/High Importance: (\d+)/);
      
      if (totalLevelsMatch && totalLevelsMatch[1]) result.statistics.totalLevels = parseInt(totalLevelsMatch[1]);
      if (resistanceLevelsMatch && resistanceLevelsMatch[1]) result.statistics.resistanceLevels = parseInt(resistanceLevelsMatch[1]);
      if (supportLevelsMatch && supportLevelsMatch[1]) result.statistics.supportLevels = parseInt(supportLevelsMatch[1]);
      if (criticalLevelsMatch && criticalLevelsMatch[1]) result.statistics.criticalLevels = parseInt(criticalLevelsMatch[1]);
      if (highImportanceMatch && highImportanceMatch[1]) result.statistics.highImportance = parseInt(highImportanceMatch[1]);
      
      return res.json(result);
    });
  } catch (error) {
    logger.error('Error in comprehensive-levels endpoint', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/scripts/sizing-recommendations', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '../scripts/show-sizing-recommendations.js');
    
    return exec(`node "${scriptPath}"`, { timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error('Error executing sizing-recommendations script', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to execute sizing recommendations script',
          details: error.message 
        });
      }
      
      if (stderr) {
        logger.warn('Script stderr', stderr);
      }
      
      // Parse the sizing recommendations output
      const result: any = {
        success: true,
        timestamp: new Date().toISOString(),
        recommendations: {} as any,
        currentConfiguration: null as any,
        safetyGuidelines: [] as string[],
        rawOutput: stdout
      };
      
      // Parse recommendations for different pair counts
      for (let numPairs = 1; numPairs <= 5; numPairs++) {
        const pairMatch = stdout.match(new RegExp(`${numPairs} Pair${numPairs > 1 ? 's' : ''}:[^]*?Anchor: ([0-9.]+)%[^]*?Hedge:  ([0-9.]+)%[^]*?Total:  ([0-9.]+)% exposure[^]*?Status: ([^]*?)\n`, 's'));
        if (pairMatch && pairMatch[1] && pairMatch[2] && pairMatch[3] && pairMatch[4]) {
          result.recommendations[numPairs] = {
            anchorSize: parseFloat(pairMatch[1]),
            hedgeSize: parseFloat(pairMatch[2]),
            totalExposure: parseFloat(pairMatch[3]),
            status: pairMatch[4].trim(),
            safe: pairMatch[4].includes('SAFE')
          };
        }
      }
      
      // Parse current configuration
      const activePairsMatch = stdout.match(/Active Pairs: ([^]*?)\n/);
      const numPairsMatch = stdout.match(/Number of Pairs: (\d+)/);
      const scalingFactorMatch = stdout.match(/Scaling Factor: ([0-9.]+)/);
      const totalExposureMatch = stdout.match(/Total Exposure: ([0-9.]+)%/);
      const safetyStatusMatch = stdout.match(/Safety Status: ([^]*?)\n/);
      const recommendationMatch = stdout.match(/Recommendation: ([^]*?)\n/);
      
      if (activePairsMatch || numPairsMatch) {
        result.currentConfiguration = {
          activePairs: activePairsMatch && activePairsMatch[1] ? activePairsMatch[1].split(', ').map(p => p.trim()) : [],
          numPairs: numPairsMatch && numPairsMatch[1] ? parseInt(numPairsMatch[1]) : 0,
          scalingFactor: scalingFactorMatch && scalingFactorMatch[1] ? parseFloat(scalingFactorMatch[1]) : 0,
          totalExposure: totalExposureMatch && totalExposureMatch[1] ? parseFloat(totalExposureMatch[1]) : 0,
          safetyStatus: safetyStatusMatch && safetyStatusMatch[1] ? safetyStatusMatch[1].trim() : '',
          recommendation: recommendationMatch && recommendationMatch[1] ? recommendationMatch[1].trim() : '',
          safe: safetyStatusMatch && safetyStatusMatch[1] ? safetyStatusMatch[1].includes('SAFE') : false
        };
      }
      
      // Parse safety guidelines
      const guidelinesMatch = stdout.match(/Safety Guidelines:[^]*?(?=Sizing recommendations displayed successfully|$)/s);
      if (guidelinesMatch) {
        const lines = guidelinesMatch[0].split('\n');
        lines.forEach(line => {
          const match = line.match(/• ([^]*?)$/);
          if (match && match[1]) {
            result.safetyGuidelines.push(match[1].trim());
          }
        });
      }
      
      return res.json(result);
    });
  } catch (error) {
    logger.error('Error in sizing-recommendations endpoint', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/scripts/price-analysis', async (req, res) => {
  try {
    const { exec } = require('child_process');
    const path = require('path');
    
    const scriptPath = path.join(__dirname, '../scripts/analyze-current-price.js');
    
    return exec(`node "${scriptPath}"`, { timeout: 30000 }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        logger.error('Error executing price-analysis script', error);
        return res.status(500).json({ 
          success: false, 
          error: 'Failed to execute price analysis script',
          details: error.message 
        });
      }
      
      if (stderr) {
        logger.warn('Script stderr', stderr);
      }
      
      // Parse the price analysis output
      const result: any = {
        success: true,
        timestamp: new Date().toISOString(),
        currentPrice: null as number | null,
        currentZone: null as string | null,
        tradingSignals: {
          longEntry: null as any,
          shortEntry: null as any,
          nearestResistance: null as any,
          nearestSupport: null as any
        },
        nearbyLevels: [] as any[],
        positionScenarios: {
          longPosition: null as any,
          shortPosition: null as any,
          noPosition: null as any
        },
        marketAnalysis: {} as any,
        rawOutput: stdout
      };
      
      // Parse current price
      const currentPriceMatch = stdout.match(/CURRENT ADA PRICE: \$([0-9.]+)/);
      if (currentPriceMatch && currentPriceMatch[1]) {
        result.currentPrice = parseFloat(currentPriceMatch[1]);
      }
      
      // Parse current zone
      const currentZoneMatch = stdout.match(/CURRENT ZONE: ([A-Z\s]+)/);
      if (currentZoneMatch && currentZoneMatch[1]) {
        result.currentZone = currentZoneMatch[1].trim();
      }
      
      // Parse trading signals (similar to comprehensive levels)
      const longEntryMatch = stdout.match(/LONG Entry Signal:[^]*?Price: \$([0-9.]+) \(([0-9.]+)% above current\)[^]*?Description: ([^]*?)\n[^]*?Importance: ([^]*?)\n[^]*?Zone: ([^]*?)\n/s);
      if (longEntryMatch && longEntryMatch[1] && longEntryMatch[2] && longEntryMatch[3] && longEntryMatch[4] && longEntryMatch[5]) {
        result.tradingSignals.longEntry = {
          price: parseFloat(longEntryMatch[1]),
          distance: parseFloat(longEntryMatch[2]),
          description: longEntryMatch[3].trim(),
          importance: longEntryMatch[4].trim(),
          zone: longEntryMatch[5].trim()
        };
      }
      
      const shortEntryMatch = stdout.match(/SHORT Entry Signal:[^]*?Price: \$([0-9.]+) \(([0-9.]+)% below current\)[^]*?Description: ([^]*?)\n[^]*?Importance: ([^]*?)\n[^]*?Zone: ([^]*?)\n/s);
      if (shortEntryMatch && shortEntryMatch[1] && shortEntryMatch[2] && shortEntryMatch[3] && shortEntryMatch[4] && shortEntryMatch[5]) {
        result.tradingSignals.shortEntry = {
          price: parseFloat(shortEntryMatch[1]),
          distance: parseFloat(shortEntryMatch[2]),
          description: shortEntryMatch[3].trim(),
          importance: shortEntryMatch[4].trim(),
          zone: shortEntryMatch[5].trim()
        };
      }
      
      // Parse nearby levels
      const nearbyLevelsMatch = stdout.match(/NEARBY LEVELS \(within 1%\):[^]*?(?=POSITION SCENARIOS:|$)/s);
      if (nearbyLevelsMatch) {
        const lines = nearbyLevelsMatch[0].split('\n');
        lines.forEach(line => {
          const match = line.match(/\$([0-9.]+) \(([0-9.]+)% (above|below)\) - ([^]*?) \[([^\]]+)\]/);
          if (match && match[1] && match[2] && match[3] && match[4] && match[5]) {
            result.nearbyLevels.push({
              price: parseFloat(match[1]),
              distance: parseFloat(match[2]),
              direction: match[3],
              description: match[4].trim(),
              importance: match[5].trim()
            });
          }
        });
      }
      
      // Parse position scenarios
      const longPositionMatch = stdout.match(/IF BOT HAS LONG POSITION:[^]*?(?=IF BOT HAS SHORT POSITION:|$)/s);
      if (longPositionMatch) {
        const lines = longPositionMatch[0].split('\n');
        result.positionScenarios.longPosition = {
          entry: lines.find(l => l.includes('Entry around:'))?.trim() || '',
          profit: lines.find(l => l.includes('Current profit:'))?.trim() || '',
          status: lines.find(l => l.includes('Status:'))?.trim() || '',
          actions: lines.filter(l => l.includes('Action:') || l.includes('-')).map(l => l.trim()).filter(l => l)
        };
      }
      
      const shortPositionMatch = stdout.match(/IF BOT HAS SHORT POSITION:[^]*?(?=IF BOT HAS NO POSITIONS:|$)/s);
      if (shortPositionMatch) {
        const lines = shortPositionMatch[0].split('\n');
        result.positionScenarios.shortPosition = {
          entry: lines.find(l => l.includes('Entry around:'))?.trim() || '',
          loss: lines.find(l => l.includes('Current loss:'))?.trim() || '',
          status: lines.find(l => l.includes('Status:'))?.trim() || '',
          actions: lines.filter(l => l.includes('Action:') || l.includes('-')).map(l => l.trim()).filter(l => l)
        };
      }
      
      const noPositionMatch = stdout.match(/IF BOT HAS NO POSITIONS:[^]*?(?=MARKET ANALYSIS:|$)/s);
      if (noPositionMatch) {
        const lines = noPositionMatch[0].split('\n');
        result.positionScenarios.noPosition = {
          status: lines.find(l => l.includes('Status:'))?.trim() || '',
          actions: lines.filter(l => l.includes('Action:') || l.includes('-')).map(l => l.trim()).filter(l => l)
        };
      }
      
      // Parse market analysis
      const marketAnalysisMatch = stdout.match(/MARKET ANALYSIS:[^]*?(?=Analysis complete!|$)/s);
      if (marketAnalysisMatch) {
        const lines = marketAnalysisMatch[0].split('\n');
        lines.forEach(line => {
          if (line.includes('Current Price:')) {
            const match = line.match(/Current Price: \$([0-9.]+)/);
            if (match && match[1]) result.marketAnalysis.currentPrice = parseFloat(match[1]);
          }
          if (line.includes('Zone:')) {
            result.marketAnalysis.zone = line.split('Zone:')[1]?.trim() || '';
          }
          if (line.includes('Trend:')) {
            result.marketAnalysis.trend = line.split('Trend:')[1]?.trim() || '';
          }
          if (line.includes('Action:')) {
            result.marketAnalysis.action = line.split('Action:')[1]?.trim() || '';
          }
        });
      }
      
      return res.json(result);
    });
  } catch (error) {
    logger.error('Error in price-analysis endpoint', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
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