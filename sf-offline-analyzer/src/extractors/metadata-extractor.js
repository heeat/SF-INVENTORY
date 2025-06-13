import BaseExtractor from '../core/base-extractor.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export default class MetadataExtractor extends BaseExtractor {
  constructor(orgAlias, dataDir) {
    super(orgAlias, dataDir);
    this.metadataDir = path.join(dataDir, 'metadata');
    this.tempDir = path.join(dataDir, 'temp');
  }

  async init() {
    await super.init();
    await fs.ensureDir(this.metadataDir);
    await fs.ensureDir(this.tempDir);
  }

  /**
   * Get list of all metadata types in the org
   * @returns {Promise<Array<string>>}
   */
  async listMetadataTypes() {
    try {
      const { stdout } = await execAsync(`sf metadata list types --json --target-org ${this.orgAlias}`);
      const result = JSON.parse(stdout);
      return result.result.map(type => type.xmlName);
    } catch (error) {
      this.logger.error('Failed to list metadata types', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract metadata for specific types
   * @param {Array<string>} types - Metadata types to extract
   * @returns {Promise<void>}
   */
  async extract(types = []) {
    try {
      // If no types specified, get all types
      if (types.length === 0) {
        types = await this.listMetadataTypes();
      }

      this.logger.info('Starting metadata extraction', { types });

      // Create package.xml
      const packageXml = this.generatePackageXml(types);
      const packageXmlPath = path.join(this.tempDir, 'package.xml');
      await fs.writeFile(packageXmlPath, packageXml);

      // Extract metadata using SFDX
      const extractPath = path.join(this.tempDir, 'extracted');
      await fs.ensureDir(extractPath);

      const { stdout, stderr } = await execAsync(
        `sf project retrieve start --json --manifest ${packageXmlPath} --target-org ${this.orgAlias} --output-dir ${extractPath}`
      );

      // Process and organize extracted metadata
      await this.processExtractedMetadata(extractPath);

      this.logger.info('Metadata extraction completed');
    } catch (error) {
      this.logger.error('Metadata extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate package.xml content
   * @param {Array<string>} types - Metadata types to include
   * @returns {string}
   */
  generatePackageXml(types) {
    const typeElements = types.map(type => `
        <types>
            <members>*</members>
            <name>${type}</name>
        </types>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    ${typeElements}
    <version>58.0</version>
</Package>`;
  }

  /**
   * Process and organize extracted metadata
   * @param {string} extractPath - Path to extracted metadata
   * @returns {Promise<void>}
   */
  async processExtractedMetadata(extractPath) {
    try {
      // Read all extracted files
      const files = await fs.readdir(extractPath);

      for (const file of files) {
        const sourcePath = path.join(extractPath, file);
        const stats = await fs.stat(sourcePath);

        if (stats.isDirectory()) {
          // If it's a directory, copy it to the metadata directory
          const targetPath = path.join(this.metadataDir, file);
          await fs.copy(sourcePath, targetPath);
        } else {
          // If it's a file, determine its type and organize accordingly
          const ext = path.extname(file);
          const targetDir = path.join(this.metadataDir, ext.substring(1));
          await fs.ensureDir(targetDir);
          await fs.copy(sourcePath, path.join(targetDir, file));
        }
      }

      // Create metadata index
      const index = await this.createMetadataIndex();
      await this.saveData('metadata/index.json', index);

    } catch (error) {
      this.logger.error('Failed to process extracted metadata', { error: error.message });
      throw error;
    }
  }

  /**
   * Create an index of extracted metadata
   * @returns {Promise<Object>}
   */
  async createMetadataIndex() {
    const index = {
      types: {},
      extractedAt: new Date().toISOString(),
      orgAlias: this.orgAlias
    };

    const dirs = await fs.readdir(this.metadataDir);
    
    for (const dir of dirs) {
      const dirPath = path.join(this.metadataDir, dir);
      const stats = await fs.stat(dirPath);
      
      if (stats.isDirectory()) {
        const files = await fs.readdir(dirPath);
        index.types[dir] = {
          count: files.length,
          files: files.map(file => ({
            name: file,
            path: path.join(dir, file)
          }))
        };
      }
    }

    return index;
  }

  /**
   * Validate extracted metadata
   * @returns {Promise<boolean>}
   */
  async validate() {
    try {
      const index = await this.loadData('metadata/index.json');
      if (!index) {
        return false;
      }

      // Check if all indexed files exist
      for (const type of Object.keys(index.types)) {
        for (const file of index.types[type].files) {
          const filePath = path.join(this.metadataDir, file.path);
          const exists = await fs.pathExists(filePath);
          if (!exists) {
            this.logger.error('Missing metadata file', { file: file.path });
            return false;
          }
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Validation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Clean up temporary files
   * @returns {Promise<void>}
   */
  async cleanup() {
    await super.cleanup();
    await fs.remove(this.tempDir);
  }
} 