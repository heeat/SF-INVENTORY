/**
 * Evidence Collector - Gathers evidence from Salesforce org
 * 
 * This class provides methods to interact with Salesforce APIs
 * and collect evidence about product usage.
 */
const Evidence = require('../models/evidence');

class EvidenceCollector {
  /**
   * Create a new evidence collector
   * 
   * @param {Object} connection - Salesforce connection object (JSForce or similar)
   */
  constructor(connection) {
    this.connection = connection;
  }
  
  /**
   * Check if an object exists and collect details about it
   * 
   * @param {string} objectName - API name of the object
   * @param {Object} options - Additional options for detection
   * @returns {Promise<Evidence>} - Evidence about the object
   */
  async checkObject(objectName, options = {}) {
    try {
      // Describe the object to check if it exists
      const objectInfo = await this.describeObject(objectName);
      
      if (!objectInfo) {
        return new Evidence('objectPresence', objectName, false);
      }
      
      // Check required fields if specified
      let requiredFieldsPresent = true;
      if (options.requiredFields && options.requiredFields.length > 0) {
        requiredFieldsPresent = options.requiredFields.every(field => 
          objectInfo.fields.some(f => f.name === field)
        );
      }
      
      // Get record count if requested
      let recordCount = null;
      if (options.checkRecordCount) {
        const countResult = await this.getRecordCount(objectName);
        recordCount = countResult.count;
      }
      
      // Get last modified date if requested
      let lastModified = null;
      if (options.checkLastModified) {
        const lastModifiedResult = await this.getLastModifiedDate(objectName);
        lastModified = lastModifiedResult.date;
      }
      
      return new Evidence(
        'objectPresence', 
        objectName, 
        true,
        {
          requiredFieldsPresent,
          recordCount,
          lastModified,
          customFields: objectInfo.fields.filter(f => f.custom).length,
          details: {
            label: objectInfo.label,
            keyPrefix: objectInfo.keyPrefix
          }
        }
      );
    } catch (error) {
      console.error(`Error checking object ${objectName}:`, error);
      return new Evidence(
        'objectPresence', 
        objectName, 
        false,
        { error: error.message }
      );
    }
  }
  
  /**
   * Check object record counts to determine usage levels
   * 
   * @param {string} objectName - API name of the object
   * @param {Object} options - Additional options like time period
   * @returns {Promise<Evidence>} - Evidence about object usage
   */
  async checkObjectUsage(objectName, options = {}) {
    try {
      // Build SOQL query with appropriate time constraints
      let soql = `SELECT COUNT() FROM ${objectName}`;
      
      if (options.timeframe) {
        const timeConstraint = this.buildTimeConstraint(options.timeframe);
        if (timeConstraint) {
          soql += ` WHERE ${timeConstraint}`;
        }
      }
      
      if (options.additionalWhere) {
        soql += soql.includes('WHERE') 
          ? ` AND ${options.additionalWhere}` 
          : ` WHERE ${options.additionalWhere}`;
      }
      
      // Execute the query
      const result = await this.connection.query(soql);
      const count = result.totalSize || 0;
      
      return new Evidence(
        'objectUsage',
        `${objectName} Usage`,
        count > 0,
        {
          count,
          threshold: options.threshold || 10,
          timeframe: options.timeframe || 'all'
        }
      );
    } catch (error) {
      console.error(`Error checking object usage ${objectName}:`, error);
      return new Evidence(
        'objectUsage',
        `${objectName} Usage`,
        false,
        { error: error.message }
      );
    }
  }
  
  /**
   * Check for feature configuration in the org
   * 
   * @param {string} featureName - Name of the feature
   * @param {Array} detectionMethods - Methods to detect the feature
   * @param {Object} options - Additional options
   * @returns {Promise<Evidence>} - Evidence about feature configuration
   */
  async checkFeature(featureName, detectionMethods, options = {}) {
    try {
      // Try each detection method until one succeeds
      for (const method of detectionMethods) {
        let detected = false;
        let details = {};
        
        switch (method.type) {
          case 'metadata':
            const result = await this.checkMetadata(method);
            detected = result.detected;
            details = { ...details, ...result.details };
            break;
            
          case 'field':
            const fieldResult = await this.checkField(method);
            detected = fieldResult.detected;
            details = { ...details, ...fieldResult.details };
            break;
            
          case 'object':
            const objectResult = await this.checkObject(method.name, { checkRecordCount: true });
            detected = objectResult.detected;
            if (detected && method.minCount) {
              detected = (objectResult.details.recordCount || 0) >= method.minCount;
            }
            details = { ...details, ...objectResult.details };
            break;
        }
        
        if (detected) {
          return new Evidence(
            'featureConfiguration',
            featureName,
            true,
            details
          );
        }
      }
      
      // If we get here, no detection method succeeded
      return new Evidence(
        'featureConfiguration',
        featureName,
        false
      );
    } catch (error) {
      console.error(`Error checking feature ${featureName}:`, error);
      return new Evidence(
        'featureConfiguration',
        featureName,
        false,
        { error: error.message }
      );
    }
  }
  
  /**
   * Check for API usage patterns
   * 
   * @param {string} name - Name of the API usage check
   * @param {Object} options - Options for API usage detection
   * @returns {Promise<Evidence>} - Evidence about API usage
   */
  async checkApiUsage(name, options = {}) {
    try {
      // In a real implementation, this would analyze API usage logs
      // For this prototype, we'll simulate the check
      
      // This would be replaced with actual API usage data access
      const simulatedUsage = Math.floor(Math.random() * 200);
      
      return new Evidence(
        'apiUsage',
        name,
        simulatedUsage > 0,
        {
          count: simulatedUsage,
          threshold: options.threshold || 100,
          object: options.object,
          timeframe: options.timeframe || 'last7Days'
        }
      );
    } catch (error) {
      console.error(`Error checking API usage ${name}:`, error);
      return new Evidence(
        'apiUsage',
        name,
        false,
        { error: error.message }
      );
    }
  }
  
  /**
   * Check for user activity patterns
   * 
   * @param {string} name - Name of the activity check
   * @param {Object} options - Options for activity detection
   * @returns {Promise<Evidence>} - Evidence about user activity
   */
  async checkUserActivity(name, options = {}) {
    try {
      // In a real implementation, this would analyze EventLogFile data
      // For this prototype, we'll simulate the check
      
      if (options.type === 'eventLog') {
        // This would be replaced with actual EventLogFile queries
        const simulatedCount = Math.floor(Math.random() * 100);
        
        return new Evidence(
          'userActivity',
          name,
          simulatedCount > 0,
          {
            count: simulatedCount,
            threshold: options.threshold || 50,
            eventType: options.eventType,
            pattern: options.pattern,
            timeframe: options.timeframe || 'last30Days'
          }
        );
      }
      
      return new Evidence(
        'userActivity',
        name,
        false,
        { error: 'Unsupported activity type' }
      );
    } catch (error) {
      console.error(`Error checking user activity ${name}:`, error);
      return new Evidence(
        'userActivity',
        name,
        false,
        { error: error.message }
      );
    }
  }
  
  /**
   * Check for code references related to a product
   * 
   * @param {string} name - Name of the code check
   * @param {Object} options - Options for code detection
   * @returns {Promise<Evidence>} - Evidence about code references
   */
  async checkCodeReferences(name, options = {}) {
    try {
      if (options.type === 'apex') {
        // Search for Apex code matching patterns
        const apexQuery = `SELECT Id, Name, Body FROM ApexClass WHERE `;
        
        let conditions = [];
        if (options.triggerObject) {
          conditions.push(`Body LIKE '%trigger%${options.triggerObject}%'`);
        } else if (options.pattern) {
          conditions.push(`Body LIKE '%${options.pattern}%'`);
        }
        
        if (conditions.length === 0) {
          return new Evidence(
            'codeReferences',
            name,
            false,
            { error: 'No search criteria specified' }
          );
        }
        
        const query = apexQuery + conditions.join(' OR ') + ' LIMIT 100';
        const result = await this.connection.tooling.query(query);
        
        const matchingClasses = result.records || [];
        
        return new Evidence(
          'codeReferences',
          name,
          matchingClasses.length > 0,
          {
            count: matchingClasses.length,
            matches: matchingClasses.map(cls => cls.Name),
            pattern: options.pattern || options.triggerObject
          }
        );
      } else if (options.type === 'lightning') {
        // This would be a search for Lightning components
        // Simulated for this prototype
        return new Evidence(
          'codeReferences',
          name,
          Math.random() > 0.5, // Simulate 50% chance of finding components
          {
            count: Math.floor(Math.random() * 5),
            matches: ['Component1', 'Component2'],
            pattern: options.pattern
          }
        );
      }
      
      return new Evidence(
        'codeReferences',
        name,
        false,
        { error: 'Unsupported code type' }
      );
    } catch (error) {
      console.error(`Error checking code references ${name}:`, error);
      return new Evidence(
        'codeReferences',
        name,
        false,
        { error: error.message }
      );
    }
  }
  
  // Utility methods
  
  /**
   * Describe a Salesforce object
   * 
   * @param {string} objectName - API name of the object
   * @returns {Promise<Object>} - Object description or null if not found
   */
  async describeObject(objectName) {
    try {
      const result = await this.connection.describe(objectName);
      return result;
    } catch (error) {
      // If object doesn't exist, return null (not an error)
      if (error.errorCode === 'INVALID_TYPE') {
        return null;
      }
      throw error;
    }
  }
  
  /**
   * Get record count for an object
   * 
   * @param {string} objectName - API name of the object
   * @returns {Promise<Object>} - Object with count property
   */
  async getRecordCount(objectName) {
    try {
      const result = await this.connection.query(`SELECT COUNT() FROM ${objectName}`);
      return { count: result.totalSize || 0 };
    } catch (error) {
      return { count: 0, error: error.message };
    }
  }
  
  /**
   * Get last modified date for an object
   * 
   * @param {string} objectName - API name of the object
   * @returns {Promise<Object>} - Object with date property
   */
  async getLastModifiedDate(objectName) {
    try {
      const result = await this.connection.query(
        `SELECT LastModifiedDate FROM ${objectName} ORDER BY LastModifiedDate DESC LIMIT 1`
      );
      return { 
        date: result.records.length > 0 ? result.records[0].LastModifiedDate : null 
      };
    } catch (error) {
      return { date: null, error: error.message };
    }
  }
  
  /**
   * Check metadata configuration
   * 
   * @param {Object} method - Metadata detection method
   * @returns {Promise<Object>} - Detection result
   */
  async checkMetadata(method) {
    // This would use the Metadata API to check settings
    // Simulated for this prototype
    return {
      detected: Math.random() > 0.3, // 70% chance of being detected
      details: {
        metadata: method.path,
        enabled: true
      }
    };
  }
  
  /**
   * Check if a field exists and has certain values
   * 
   * @param {Object} method - Field detection method
   * @returns {Promise<Object>} - Detection result
   */
  async checkField(method) {
    try {
      const objectInfo = await this.describeObject(method.object);
      
      if (!objectInfo) {
        return { detected: false };
      }
      
      let fieldDetected = false;
      let fieldInfo = null;
      
      if (method.name) {
        // Look for exact field name
        fieldInfo = objectInfo.fields.find(f => f.name === method.name);
        fieldDetected = !!fieldInfo;
      } else if (method.pattern) {
        // Look for field matching pattern
        const regex = new RegExp(method.pattern);
        fieldInfo = objectInfo.fields.find(f => regex.test(f.name));
        fieldDetected = !!fieldInfo;
      }
      
      if (fieldDetected && method.checkValues) {
        // If we need to check picklist values, we would do it here
        // This is simulated for the prototype
        return {
          detected: true,
          details: {
            fieldName: fieldInfo.name,
            fieldType: fieldInfo.type,
            hasCustomValues: Math.random() > 0.5
          }
        };
      }
      
      return {
        detected: fieldDetected,
        details: fieldInfo ? {
          fieldName: fieldInfo.name,
          fieldType: fieldInfo.type
        } : {}
      };
    } catch (error) {
      console.error(`Error checking field ${method.object}.${method.name || method.pattern}:`, error);
      return { detected: false, error: error.message };
    }
  }
  
  /**
   * Build a SOQL time constraint based on a timeframe string
   * 
   * @param {string} timeframe - Time period (e.g., "last30Days")
   * @returns {string} - SOQL time constraint
   */
  buildTimeConstraint(timeframe) {
    if (!timeframe) return '';
    
    // Parse common timeframe patterns
    if (timeframe.startsWith('last')) {
      const match = timeframe.match(/last(\d+)(Days|Months|Years)/i);
      if (match) {
        const [_, num, unit] = match;
        return `CreatedDate = LAST_N_${unit.toUpperCase()}:${num}`;
      }
    }
    
    // Default to all time if we can't parse
    return '';
  }
}

module.exports = EvidenceCollector; 