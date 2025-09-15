import { io } from '../server';
import { logger } from '../utils/logger';

export interface PositionData {
  symbol: string;
  side: 'LONG' | 'SHORT';
  size: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  status: string;
}

export interface BalanceData {
  total: number;
  available: number;
  pnl: number;
  positions: number;
}

export interface BotStatusData {
  status: string;
  timestamp: string;
  version: string;
}

export class WebSocketService {
  private static instance: WebSocketService;
  private isInitialized = false;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  public initialize(): void {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;
    logger.info('WebSocket service initialized');
  }

  public broadcastBotStatus(data: BotStatusData): void {
    if (!this.isInitialized) return;
    
    io.emit('bot-status', data);
    logger.debug('Bot status broadcasted', data);
  }

  public broadcastPositionUpdate(positions: PositionData[]): void {
    if (!this.isInitialized) return;
    
    io.emit('position-update', { positions });
    logger.debug('Position update broadcasted', { count: positions.length });
  }

  public broadcastBalanceUpdate(data: BalanceData): void {
    if (!this.isInitialized) return;
    
    io.emit('balance-update', data);
    logger.debug('Balance update broadcasted', data);
  }

  public broadcastLogEntry(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    if (!this.isInitialized) return;
    
    io.emit('log-entry', { message, level, timestamp: new Date().toISOString() });
    logger.debug('Log entry broadcasted', { message, level });
  }

  public broadcastTradingSignal(signal: any): void {
    if (!this.isInitialized) return;
    
    io.emit('trading-signal', signal);
    logger.debug('Trading signal broadcasted', signal);
  }

  public broadcastAIAnalysis(analysis: any): void {
    if (!this.isInitialized) return;
    
    io.emit('ai-analysis', analysis);
    logger.debug('AI analysis broadcasted', analysis);
  }

  public broadcastPerformanceMetrics(metrics: any): void {
    if (!this.isInitialized) return;
    
    io.emit('performance-metrics', metrics);
    logger.debug('Performance metrics broadcasted', metrics);
  }

  public getConnectedClients(): number {
    return io.engine.clientsCount;
  }

  public isClientConnected(): boolean {
    return this.getConnectedClients() > 0;
  }
}