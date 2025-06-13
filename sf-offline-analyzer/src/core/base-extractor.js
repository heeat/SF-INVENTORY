import fs from 'fs-extra';
import path from 'path';
import winston from 'winston';

export default class BaseExtractor {
  constructor(orgAlias, dataDir) {
    this.orgAlias = orgAlias;
    this.dataDir = dataDir;
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ 
          filename: path.join(dataDir, 'logs', 'extractor-error.log'), 
          level: 'error' 
        }),
        new winston.transports.File({ 
          filename: path.join(dataDir, 'logs', 'extractor.log')
        }),
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        })
      ]
    });
  }

  /**
   * Initialize the extractor
   * @returns {Promise<void>}
   */
  async init() {
    await fs.ensureDir(this.dataDir);
    await fs.ensureDir(path.join(this.dataDir, 'logs'));
    this.logger.info('Initialized extractor', {
      orgAlias: this.orgAlias,
      dataDir: this.dataDir
    });
  }

  /**
   * Extract data from the org
   * @returns {Promise<void>}
   */
  async extract() {
    throw new Error('extract() must be implemented by subclass');
  }

  /**
   * Validate extracted data
   * @returns {Promise<boolean>}
   */
  async validate() {
    throw new Error('validate() must be implemented by subclass');
  }

  /**
   * Clean up any temporary files or resources
   * @returns {Promise<void>}
   */
  async cleanup() {
    this.logger.info('Cleaning up extractor');
  }

  /**
   * Save extracted data to the local filesystem
   * @param {string} relativePath - Path relative to dataDir
   * @param {Object|string} data - Data to save
   * @returns {Promise<void>}
   */
  async saveData(relativePath, data) {
    const fullPath = path.join(this.dataDir, relativePath);
    await fs.ensureDir(path.dirname(fullPath));
    
    if (typeof data === 'object') {
      await fs.writeJson(fullPath, data, { spaces: 2 });
    } else {
      await fs.writeFile(fullPath, data);
    }
    
    this.logger.info('Saved data', { path: relativePath });
  }

  /**
   * Load previously extracted data
   * @param {string} relativePath - Path relative to dataDir
   * @returns {Promise<Object|string>}
   */
  async loadData(relativePath) {
    const fullPath = path.join(this.dataDir, relativePath);
    
    try {
      const stats = await fs.stat(fullPath);
      if (!stats.isFile()) {
        throw new Error('Not a file');
      }
      
      if (fullPath.endsWith('.json')) {
        return await fs.readJson(fullPath);
      } else {
        return await fs.readFile(fullPath, 'utf8');
      }
    } catch (error) {
      this.logger.error('Failed to load data', {
        path: relativePath,
        error: error.message
      });
      return null;
    }
  }
} 