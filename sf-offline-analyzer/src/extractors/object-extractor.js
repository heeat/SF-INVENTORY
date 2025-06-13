import BaseExtractor from '../core/base-extractor.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export default class ObjectExtractor extends BaseExtractor {
  constructor(orgAlias, dataDir) {
    super(orgAlias, dataDir);
    this.objectsDir = path.join(dataDir, 'metadata', 'objects');
    this.schemaDir = path.join(dataDir, 'metadata', 'schema');
  }

  async init() {
    await super.init();
    await fs.ensureDir(this.objectsDir);
    await fs.ensureDir(this.schemaDir);
  }

  /**
   * Extract all objects and their metadata
   * @returns {Promise<void>}
   */
  async extract() {
    try {
      this.logger.info('Starting object extraction');

      // Get list of all objects
      const objects = await this.listObjects();
      
      // Extract each object's metadata
      for (const obj of objects) {
        await this.extractObject(obj);
      }

      // Create schema index
      const index = await this.createSchemaIndex();
      await this.saveData('metadata/schema/index.json', index);

      this.logger.info('Object extraction completed');
    } catch (error) {
      this.logger.error('Object extraction failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get list of all objects in the org
   * @returns {Promise<Array<string>>}
   */
  async listObjects() {
    try {
      const { stdout } = await execAsync(
        `sf sobject list --json --target-org ${this.orgAlias}`
      );
      const result = JSON.parse(stdout);
      return result.result.sobjects || [];
    } catch (error) {
      this.logger.error('Failed to list objects', { error: error.message });
      throw error;
    }
  }

  /**
   * Extract metadata for a specific object
   * @param {string} objectName - API name of the object
   * @returns {Promise<void>}
   */
  async extractObject(objectName) {
    try {
      // Get object describe
      const { stdout } = await execAsync(
        `sf sobject describe --sobject ${objectName} --json --target-org ${this.orgAlias}`
      );
      const describe = JSON.parse(stdout).result;

      // Save full describe result
      await this.saveData(
        `metadata/objects/${objectName}.json`,
        describe
      );

      // Extract key metadata for schema
      const schemaData = {
        name: describe.name,
        label: describe.label,
        custom: describe.custom,
        createable: describe.createable,
        updateable: describe.updateable,
        deletable: describe.deletable,
        fields: describe.fields.map(field => ({
          name: field.name,
          label: field.label,
          type: field.type,
          custom: field.custom,
          required: field.nillable === false,
          defaultValue: field.defaultValue,
          picklistValues: field.picklistValues,
          referenceTo: field.referenceTo,
          relationshipName: field.relationshipName
        })),
        recordTypes: describe.recordTypeInfos,
        childRelationships: describe.childRelationships.map(rel => ({
          childObject: rel.childSObject,
          field: rel.field,
          relationshipName: rel.relationshipName
        }))
      };

      await this.saveData(
        `metadata/schema/${objectName}.json`,
        schemaData
      );

    } catch (error) {
      this.logger.error(`Failed to extract object ${objectName}`, { error: error.message });
      throw error;
    }
  }

  /**
   * Create schema index with relationships
   * @returns {Promise<Object>}
   */
  async createSchemaIndex() {
    const index = {
      objects: {},
      relationships: {},
      extractedAt: new Date().toISOString(),
      orgAlias: this.orgAlias
    };

    const schemaFiles = await fs.readdir(this.schemaDir);
    
    // First pass: collect all objects
    for (const file of schemaFiles) {
      if (file.endsWith('.json') && file !== 'index.json') {
        const objectName = path.basename(file, '.json');
        const schema = await this.loadData(`metadata/schema/${file}`);
        
        if (schema) {
          index.objects[objectName] = {
            label: schema.label,
            custom: schema.custom,
            fields: schema.fields.length,
            recordTypes: schema.recordTypes.length
          };
        }
      }
    }

    // Second pass: build relationships
    for (const file of schemaFiles) {
      if (file.endsWith('.json') && file !== 'index.json') {
        const objectName = path.basename(file, '.json');
        const schema = await this.loadData(`metadata/schema/${file}`);
        
        if (schema) {
          // Add lookup and master-detail relationships
          schema.fields
            .filter(field => field.referenceTo && field.referenceTo.length > 0)
            .forEach(field => {
              field.referenceTo.forEach(refObject => {
                if (!index.relationships[objectName]) {
                  index.relationships[objectName] = [];
                }
                index.relationships[objectName].push({
                  type: 'reference',
                  field: field.name,
                  toObject: refObject,
                  relationshipName: field.relationshipName
                });
              });
            });

          // Add child relationships
          schema.childRelationships.forEach(rel => {
            if (!index.relationships[rel.childObject]) {
              index.relationships[rel.childObject] = [];
            }
            index.relationships[rel.childObject].push({
              type: 'child',
              field: rel.field,
              toObject: objectName,
              relationshipName: rel.relationshipName
            });
          });
        }
      }
    }

    return index;
  }

  /**
   * Validate extracted object data
   * @returns {Promise<boolean>}
   */
  async validate() {
    try {
      const index = await this.loadData('metadata/schema/index.json');
      if (!index) {
        return false;
      }

      // Check if all indexed objects exist
      for (const objectName of Object.keys(index.objects)) {
        const schemaFile = path.join(this.schemaDir, `${objectName}.json`);
        const describeFile = path.join(this.objectsDir, `${objectName}.json`);
        
        if (!(await fs.pathExists(schemaFile)) || !(await fs.pathExists(describeFile))) {
          this.logger.error('Missing object files', { objectName });
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