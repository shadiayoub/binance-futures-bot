/**
 * Pair Data Loader
 * Loads comprehensive levels and other pair-specific data from files
 */

import * as fs from 'fs';
import * as path from 'path';
import { PairConfig } from '../config/PairConfig';
import { logger } from '../utils/logger';

export interface LevelData {
  price: number;
  description: string;
  type: 'RESISTANCE' | 'SUPPORT';
  importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  zone: string;
  category?: string;
}

export class PairLoader {
  /**
   * Load comprehensive levels from CSV file
   */
  static async loadComprehensiveLevelsFromCSV(filePath: string): Promise<LevelData[]> {
    try {
      const fullPath = path.resolve(filePath);
      
      if (!fs.existsSync(fullPath)) {
        throw new Error(`CSV file not found: ${fullPath}`);
      }
      
      const csvContent = fs.readFileSync(fullPath, 'utf-8');
      const lines = csvContent.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error('CSV file must have at least a header and one data row');
      }
      
      const levels: LevelData[] = [];
      const headers = lines[0]?.split(',').map(h => h.replace(/"/g, '').trim()) || [];
      
      // Find column indices
      const priceIndex = headers.findIndex(h => h.toLowerCase().includes('price'));
      const descriptionIndex = headers.findIndex(h => h.toLowerCase().includes('support/resistance') || h.toLowerCase().includes('level'));
      const turningPointIndex = headers.findIndex(h => h.toLowerCase().includes('turning') || h.toLowerCase().includes('key'));
      
      if (priceIndex === -1) {
        throw new Error('Price column not found in CSV');
      }
      
      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i]?.split(',').map(cell => cell.replace(/"/g, '').trim()) || [];
        
        if (row.length < 2) continue;
        
        const priceStr = row[priceIndex];
        if (!priceStr || isNaN(parseFloat(priceStr))) continue;
        
        const price = parseFloat(priceStr);
        const description = descriptionIndex !== -1 ? (row[descriptionIndex] || '') : `Level ${price}`;
        const turningPoint = turningPointIndex !== -1 ? (row[turningPointIndex] || '') : '';
        
        // Determine type and importance
        const { type, importance, zone } = this.analyzeLevel(description, turningPoint, price);
        
        const levelData: LevelData = {
          price,
          description: description || turningPoint || `Level ${price}`,
          type,
          importance,
          zone
        };
        
        if (turningPoint) {
          levelData.category = turningPoint;
        }
        
        levels.push(levelData);
      }
      
      logger.info(`Loaded ${levels.length} levels from ${filePath}`, {
        filePath,
        resistanceLevels: levels.filter(l => l.type === 'RESISTANCE').length,
        supportLevels: levels.filter(l => l.type === 'SUPPORT').length
      });
      
      return levels;
      
    } catch (error) {
      logger.error(`Failed to load comprehensive levels from ${filePath}`, error);
      throw error;
    }
  }
  
  /**
   * Analyze level to determine type, importance, and zone
   */
  private static analyzeLevel(description: string, turningPoint: string, price: number): {
    type: 'RESISTANCE' | 'SUPPORT';
    importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    zone: string;
  } {
    const desc = (description + ' ' + turningPoint).toLowerCase();
    
    // Determine type
    let type: 'RESISTANCE' | 'SUPPORT' = 'RESISTANCE';
    if (desc.includes('support') || desc.includes('low') || desc.includes('bottom')) {
      type = 'SUPPORT';
    } else if (desc.includes('resistance') || desc.includes('high') || desc.includes('top')) {
      type = 'RESISTANCE';
    }
    
    // Determine importance
    let importance: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (desc.includes('critical') || desc.includes('52-week') || desc.includes('13-week') || desc.includes('1-month')) {
      importance = 'CRITICAL';
    } else if (desc.includes('high') || desc.includes('pivot') || desc.includes('standard deviation')) {
      importance = 'HIGH';
    } else if (desc.includes('rsi') || desc.includes('stochastic') || desc.includes('moving average')) {
      importance = 'MEDIUM';
    } else {
      importance = 'LOW';
    }
    
    // Determine zone (this would be pair-specific)
    let zone = 'Current Zone';
    if (type === 'RESISTANCE') {
      if (importance === 'CRITICAL') {
        zone = 'Extreme Bull Zone';
      } else if (importance === 'HIGH') {
        zone = 'Bull Zone';
      }
    } else if (type === 'SUPPORT') {
      if (importance === 'CRITICAL') {
        zone = 'Extreme Bear Zone';
      } else if (importance === 'HIGH') {
        zone = 'Bear Zone';
      }
    }
    
    return { type, importance, zone };
  }
  
  /**
   * Load comprehensive levels for a pair configuration
   */
  static async loadPairComprehensiveLevels(config: PairConfig): Promise<LevelData[]> {
    if (config.comprehensiveLevels.source === 'csv' && config.comprehensiveLevels.filePath) {
      return await this.loadComprehensiveLevelsFromCSV(config.comprehensiveLevels.filePath);
    } else if (config.comprehensiveLevels.source === 'hardcoded' && config.comprehensiveLevels.levels) {
      return config.comprehensiveLevels.levels;
    } else {
      throw new Error(`Unsupported comprehensive levels source: ${config.comprehensiveLevels.source}`);
    }
  }
  
  /**
   * Validate pair configuration files exist
   */
  static validatePairFiles(config: PairConfig): string[] {
    const errors: string[] = [];
    
    if (config.comprehensiveLevels.source === 'csv' && config.comprehensiveLevels.filePath) {
      const fullPath = path.resolve(config.comprehensiveLevels.filePath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`Comprehensive levels CSV file not found: ${fullPath}`);
      }
    }
    
    return errors;
  }
}

export default PairLoader;
