import BaseExtractor from '../core/base-extractor.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export default class ApexExtractor extends BaseExtractor {
  constructor(orgAlias, dataDir) {
    super(orgAlias, dataDir);
    this.apexDir = path.join(dataDir, 'code', 'apex');
    this.triggersDir = path.join(dataDir, 'code', 'triggers');
  }

  async init() {
    await super.init();
    await fs.ensureDir(this.apexDir);
    await fs.ensureDir(this.triggersDir);
  }

  /**
   * Extract all Apex code from the org
   * @returns {Promise<void>}
   */
  async extract() {
    try {
      this.logger.info('Starting Apex code extraction');

      // Extract Apex classes
      await this.extractApexClasses();

      // Extract Apex triggers
      await this.extractApexTriggers();

      // Create code index
      const index = await this.createCodeIndex();
      await this.saveData('code/apex/index.json', index);

      this.logger.info('Apex code extraction completed');
    } catch (error) {
      this.logger.error('Apex code extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract Apex classes
   * @returns {Promise<void>}
   */
  async extractApexClasses() {
    try {
      // Query all Apex classes
      const { stdout } = await execAsync(
        `sf apex list class --json --target-org ${this.orgAlias}`
      );
      const result = JSON.parse(stdout);
      const classes = result.result || [];

      for (const cls of classes) {
        // Get class body
        const { stdout: bodyResult } = await execAsync(
          `sf apex get class --class-name ${cls.name} --json --target-org ${this.orgAlias}`
        );
        const body = JSON.parse(bodyResult).result;

        // Save class file
        const fileName = `${cls.name}.cls`;
        await fs.writeFile(
          path.join(this.apexDir, fileName),
          body
        );

        // Save metadata
        await this.saveData(
          `code/apex/${cls.name}.json`,
          {
            id: cls.id,
            name: cls.name,
            isTest: body.includes('@IsTest'),
            length: body.length,
            status: cls.status,
            createdDate: cls.createdDate,
            lastModifiedDate: cls.lastModifiedDate
          }
        );
      }
    } catch (error) {
      this.logger.error('Failed to extract Apex classes', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract Apex triggers
   * @returns {Promise<void>}
   */
  async extractApexTriggers() {
    try {
      // Query all Apex triggers
      const { stdout } = await execAsync(
        `sf apex list trigger --json --target-org ${this.orgAlias}`
      );
      const result = JSON.parse(stdout);
      const triggers = result.result || [];

      for (const trigger of triggers) {
        // Get trigger body
        const { stdout: bodyResult } = await execAsync(
          `sf apex get trigger --trigger-name ${trigger.name} --json --target-org ${this.orgAlias}`
        );
        const body = JSON.parse(bodyResult).result;

        // Save trigger file
        const fileName = `${trigger.name}.trigger`;
        await fs.writeFile(
          path.join(this.triggersDir, fileName),
          body
        );

        // Save metadata
        await this.saveData(
          `code/triggers/${trigger.name}.json`,
          {
            id: trigger.id,
            name: trigger.name,
            object: trigger.tablename,
            status: trigger.status,
            createdDate: trigger.createdDate,
            lastModifiedDate: trigger.lastModifiedDate
          }
        );
      }
    } catch (error) {
      this.logger.error('Failed to extract Apex triggers', { error: error.message });
      throw error;
    }
  }

  /**
   * Create index of extracted code
   * @returns {Promise<Object>}
   */
  async createCodeIndex() {
    const index = {
      classes: {},
      triggers: {},
      extractedAt: new Date().toISOString(),
      orgAlias: this.orgAlias
    };

    // Index classes
    const classFiles = await fs.readdir(this.apexDir);
    for (const file of classFiles) {
      if (file.endsWith('.cls')) {
        const name = path.basename(file, '.cls');
        const metadata = await this.loadData(`code/apex/${name}.json`);
        if (metadata) {
          index.classes[name] = metadata;
        }
      }
    }

    // Index triggers
    const triggerFiles = await fs.readdir(this.triggersDir);
    for (const file of triggerFiles) {
      if (file.endsWith('.trigger')) {
        const name = path.basename(file, '.trigger');
        const metadata = await this.loadData(`code/triggers/${name}.json`);
        if (metadata) {
          index.triggers[name] = metadata;
        }
      }
    }

    return index;
  }

  /**
   * Validate extracted code
   * @returns {Promise<boolean>}
   */
  async validate() {
    try {
      const index = await this.loadData('code/apex/index.json');
      if (!index) {
        return false;
      }

      // Check if all indexed files exist
      for (const [name, metadata] of Object.entries(index.classes)) {
        const classFile = path.join(this.apexDir, `${name}.cls`);
        const metadataFile = path.join(this.dataDir, 'code', 'apex', `${name}.json`);
        
        if (!(await fs.pathExists(classFile)) || !(await fs.pathExists(metadataFile))) {
          this.logger.error('Missing class files', { name });
          return false;
        }
      }

      for (const [name, metadata] of Object.entries(index.triggers)) {
        const triggerFile = path.join(this.triggersDir, `${name}.trigger`);
        const metadataFile = path.join(this.dataDir, 'code', 'triggers', `${name}.json`);
        
        if (!(await fs.pathExists(triggerFile)) || !(await fs.pathExists(metadataFile))) {
          this.logger.error('Missing trigger files', { name });
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.error('Validation failed', { error: error.message });
      return false;
    }
  }
} 