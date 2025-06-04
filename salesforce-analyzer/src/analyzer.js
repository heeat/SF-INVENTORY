/**
 * Salesforce Product Analyzer
 * Main analyzer class for connecting to Salesforce and analyzing product usage
 */

const jsforce = require('jsforce');
const readline = require('readline');
const { getSfdxOrgCredentials, listSfdxOrgs, getConnectedOrgs } = require('./utils/sfdx-helper');
const { loadConfiguration } = require('./config-loader');

/**
 * Evidence class for storing analysis results
 */
class Evidence {
  constructor(type, name, detected, details = {}) {
    this.type = type;
    this.name = name;
    this.detected = detected;
    this.details = details;
  }
}

class Analyzer {
  /**
   * Create a new analyzer
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    this.options = options;
    this.connection = null;
    this.config = null;
    this.productConfig = null;
  }

  /**
   * Run the analyzer
   */
  async run() {
    try {
      // 1. Load configuration
      await this.loadConfig();
      
      // 2. Authenticate with Salesforce
      await this.authenticate();
      
      // 3. Check the product to analyze
      await this.selectProduct();
      
      // 4. Run the analysis
      const results = await this.analyze();
      
      // 5. Output results
      await this.outputResults(results);
      
      // 6. Clean up
      await this.cleanup();
      
      return results;
    } catch (error) {
      console.error(`Analysis failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Load all necessary configurations
   */
  async loadConfig() {
    this.config = await loadConfiguration();
    console.log('Configuration loaded successfully.');
  }
  
  /**
   * Authenticate with Salesforce
   */
  async authenticate() {
    // Skip authentication in test mode
    if (this.options.test) {
      console.log('Running in test mode. No Salesforce connection needed.');
      return;
    }
    
    let connectionOptions = {};
    
    // Try SFDX authentication first if requested
    if (this.options.useSfdx) {
      try {
        console.log('Using SFDX authentication...');
        
        // If a specific org is specified, use it
        if (this.options.sfdxUsername) {
          connectionOptions = await getSfdxOrgCredentials(this.options.sfdxUsername);
        } else {
          // Otherwise, list orgs and have user choose
          connectionOptions = await this.chooseSfdxOrg();
        }
        
        console.log(`Successfully authenticated as ${connectionOptions.username}`);
      } catch (error) {
        console.error(`SFDX authentication failed: ${error.message}`);
        console.log('Falling back to direct authentication...');
      }
    }
    
    // If SFDX auth failed or wasn't requested, use direct auth
    if (Object.keys(connectionOptions).length === 0) {
      // Direct connection options from arguments or environment
      connectionOptions = {
        loginUrl: this.options.loginUrl || process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
        accessToken: this.options.accessToken || process.env.SF_ACCESS_TOKEN,
        instanceUrl: this.options.instanceUrl || process.env.SF_INSTANCE_URL,
        username: this.options.username || process.env.SF_USERNAME,
        password: this.options.password || process.env.SF_PASSWORD
      };
    }
    
    // If no authentication info available, error out
    if (!connectionOptions.accessToken && 
        !(connectionOptions.username && connectionOptions.password)) {
      throw new Error('No authentication credentials provided. Please use --sfdx or provide direct credentials.');
    }
    
    // Connect to Salesforce
    this.connection = await this.connectToSalesforce(connectionOptions);
  }
  
  /**
   * Connect to Salesforce using the provided credentials
   * @param {Object} options Connection options
   * @returns {jsforce.Connection} JSForce connection
   */
  async connectToSalesforce(options) {
    console.log('Connecting to Salesforce...');
    
    const connection = new jsforce.Connection({
      loginUrl: options.loginUrl || 'https://login.salesforce.com'
    });
    
    try {
      // If access token is provided, use it
      if (options.accessToken && options.instanceUrl) {
        connection.accessToken = options.accessToken;
        connection.instanceUrl = options.instanceUrl;
        
        // Verify the connection
        await connection.identity();
        console.log('Connected to Salesforce using access token.');
      } 
      // Otherwise use username/password
      else if (options.username && options.password) {
        await connection.login(options.username, options.password);
        console.log('Connected to Salesforce using username and password.');
      } else {
        throw new Error('Invalid connection options. Either accessToken or username/password is required.');
      }
      
      return connection;
    } catch (error) {
      throw new Error(`Failed to connect to Salesforce: ${error.message}`);
    }
  }
  
  /**
   * Select the product to analyze
   */
  async selectProduct() {
    // Skip in test mode
    if (this.options.test) return;
    
    // If product name is provided, find it
    if (this.options.productName) {
      const product = this.config.products.find(p => 
        p.name.toLowerCase() === this.options.productName.toLowerCase());
      
      if (!product) {
        throw new Error(`Product "${this.options.productName}" not found in configuration.`);
      }
      
      this.productConfig = product;
      console.log(`Selected product: ${this.productConfig.name}`);
    } 
    // Otherwise prompt the user to select one
    else {
      this.productConfig = await this.chooseProduct();
    }
  }
  
  /**
   * Prompt user to select a product from the available ones
   * @returns {Object} Selected product configuration
   */
  async chooseProduct() {
    const productNames = this.config.products.map(p => p.name);
    
    console.log('Available products:');
    productNames.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    return new Promise((resolve, reject) => {
      rl.question('Select a product (number): ', (answer) => {
        rl.close();
        
        const selection = parseInt(answer.trim(), 10);
        if (isNaN(selection) || selection < 1 || selection > productNames.length) {
          reject(new Error('Invalid selection'));
          return;
        }
        
        const selectedProduct = this.config.products[selection - 1];
        console.log(`Selected product: ${selectedProduct.name}`);
        resolve(selectedProduct);
      });
    });
  }
  
  /**
   * Display a list of available SFDX orgs and let user select one
   * @returns {Object} Selected org's credentials
   */
  async chooseSfdxOrg() {
    try {
      console.log('Checking for authorized Salesforce orgs...');
      
      // Get connected orgs only
      const orgs = await getConnectedOrgs();
      
      if (!orgs || orgs.length === 0) {
        throw new Error('No connected orgs found. Please authenticate with SFDX first or provide credentials.');
      }
      
      // Display available orgs
      console.log('Found authorized orgs:');
      const orgDisplayNames = orgs.map(org => `${org.alias || 'No Alias'} - ${org.username} (${org.status})`);
      
      // Prompt user to select an org
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve, reject) => {
        // Display options
        orgDisplayNames.forEach((name, index) => {
          console.log(`${index + 1}. ${name}`);
        });
        
        rl.question('Select an org (number): ', async (answer) => {
          rl.close();
          
          const selection = parseInt(answer.trim(), 10);
          if (isNaN(selection) || selection < 1 || selection > orgs.length) {
            reject(new Error('Invalid selection'));
            return;
          }
          
          const selectedOrg = orgs[selection - 1];
          console.log(`Getting credentials for org: ${selectedOrg.username}`);
          
          try {
            const credentials = await getSfdxOrgCredentials(selectedOrg.username);
            resolve(credentials);
          } catch (error) {
            reject(error);
          }
        });
      });
    } catch (error) {
      throw new Error(`Error listing SFDX orgs: ${error.message}`);
    }
  }
  
  /**
   * Check if an object exists and how many records it has
   * 
   * @param {string} objectName - API name of the object
   * @returns {Promise<Evidence>} - Evidence about the object
   */
  async checkObject(objectName, options = {}) {
    try {
      // Check if the object exists by describing it
      let objectInfo = null;
      
      try {
        objectInfo = await this.connection.describe(objectName);
      } catch (e) {
        // Object doesn't exist or no access
        return new Evidence('objectPresence', objectName, false);
      }
      
      // Check required fields if specified
      let requiredFieldsPresent = true;
      if (options.requiredFields && options.requiredFields.length > 0) {
        const fieldNames = objectInfo.fields.map(f => f.name);
        requiredFieldsPresent = options.requiredFields.every(field => 
          fieldNames.includes(field)
        );
      }
      
      // Get record count
      let recordCount = 0;
      
      try {
        const countQuery = `SELECT COUNT() FROM ${objectName}`;
        const countResult = await this.connection.query(countQuery);
        recordCount = countResult.totalSize;
      } catch (e) {
        console.log(`Warning: Couldn't query ${objectName} count: ${e.message}`);
      }
      
      return new Evidence(
        'objectPresence', 
        objectName, 
        true,
        {
          requiredFieldsPresent,
          recordCount,
          label: objectInfo.label,
          fields: objectInfo.fields.length,
          customFields: objectInfo.fields.filter(f => f.custom).length
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
   * Check object usage by looking at recent records
   * 
   * @param {string} objectName - API name of the object
   * @param {Object} options - Additional options
   * @returns {Promise<Evidence>} - Evidence about object usage
   */
  async checkObjectUsage(objectName, options = {}) {
    try {
      // Build query to check records created/modified in the last 30 days
      const timeField = options.timeField || 'LastModifiedDate';
      const threshold = options.threshold || 10;
      const timeframe = options.timeframe || 'LAST_N_DAYS:30';
      
      const query = `SELECT COUNT() FROM ${objectName} WHERE ${timeField} >= ${timeframe}`;
      
      let recentCount = 0;
      try {
        const result = await this.connection.query(query);
        recentCount = result.totalSize;
      } catch (e) {
        console.log(`Warning: Couldn't query recent ${objectName} activity: ${e.message}`);
      }
      
      return new Evidence(
        'objectUsage',
        `${objectName} Recent Usage`,
        recentCount > 0,
        options.weight || 1.0,
        {
          count: recentCount,
          threshold: threshold,
          active: recentCount >= threshold,
          timeframe: timeframe
        }
      );
    } catch (error) {
      console.error(`Error checking object usage ${objectName}:`, error);
      return new Evidence(
        'objectUsage',
        `${objectName} Usage`,
        false,
        options.weight || 1.0,
        { error: error.message }
      );
    }
  }
  
  /**
   * Check for feature configuration using metadata
   * 
   * @param {string} featureName - Name of the feature
   * @param {Object} options - Additional options
   * @returns {Promise<Evidence>} - Evidence about feature
   */
  async checkFeature(featureName, options = {}) {
    try {
      const { metadataType, detectionQuery } = options;
      
      if (!metadataType && !detectionQuery) {
        return new Evidence(
          'featureConfiguration',
          featureName,
          false,
          options.weight || 1.0,
          { error: 'No detection method specified' }
        );
      }
      
      // If a detection query is provided, use it
      if (detectionQuery) {
        try {
          const result = await this.connection.query(detectionQuery);
          return new Evidence(
            'featureConfiguration',
            featureName,
            result.totalSize > 0,
            options.weight || 1.0,
            { count: result.totalSize, records: result.records }
          );
        } catch (e) {
          console.log(`Warning: Feature detection query failed for ${featureName}: ${e.message}`);
          return new Evidence(
            'featureConfiguration',
            featureName,
            false,
            options.weight || 1.0,
            { error: e.message }
          );
        }
      }
      
      // Otherwise try to check metadata (this would need to be expanded with actual metadata API calls)
      return new Evidence(
        'featureConfiguration',
        featureName,
        false,
        options.weight || 1.0,
        { error: 'Metadata detection not yet implemented' }
      );
    } catch (error) {
      console.error(`Error checking feature ${featureName}:`, error);
      return new Evidence(
        'featureConfiguration',
        featureName,
        false,
        options.weight || 1.0,
        { error: error.message }
      );
    }
  }
  
  /**
   * Analyze the current Salesforce org
   * 
   * @returns {Object} Analysis results
   */
  async analyze() {
    // Skip in test mode
    if (this.options.test) {
      return { message: 'Test mode - no analysis performed' };
    }
    
    console.log(`Analyzing ${this.productConfig.name} usage...`);
    
    try {
      // Create results container
      const results = {
        product: this.productConfig.name,
        timestamp: new Date().toISOString(),
        indicatorResults: [],
        summary: {}
      };
      
      // Analyze each indicator category
      for (const indicator of this.productConfig.indicators) {
        console.log(`Analyzing ${indicator.category}...`);
        
        const categoryResults = await this.analyzeCategory(indicator);
        results.indicatorResults.push(categoryResults);
      }
      
      // Generate summary metrics
      results.summary = this.generateSummary(results.indicatorResults);
      
      // Show cloud-specific integration summary if verbose mode is enabled
      if (this.options.verbose) {
        this.showCloudSpecificIntegrationSummary(results.product);
      }
      
      return results;
    } catch (error) {
      console.error(`Analysis error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Display a summary of cloud-specific integrations that were detected
   */
  showCloudSpecificIntegrationSummary(productName) {
    console.log('\n=== CLOUD-SPECIFIC INTEGRATION SUMMARY ===');
    console.log(`For ${productName}, we detected the following:`);
    
    // Integration fields on cloud-specific objects
    let objectsToCheck;
    let keywords;
    
    if (productName === 'Service Cloud') {
      objectsToCheck = ['Case', 'Contact', 'Knowledge__kav'];
      keywords = ['case', 'service', 'support', 'ticket', 'knowledge'];
    } else if (productName === 'Sales Cloud') {
      objectsToCheck = ['Opportunity', 'Lead', 'Account', 'Contact'];
      keywords = ['opportunity', 'lead', 'sales', 'pipeline', 'forecast'];
    } else if (productName === 'Experience Cloud') {
      objectsToCheck = ['Network', 'NetworkMember', 'ContentDocument', 'FeedItem'];
      keywords = ['community', 'experience', 'site', 'portal', 'network'];
    } else {
      objectsToCheck = ['Case', 'Opportunity', 'Network'];
      keywords = ['varies by cloud product'];
    }
    
    console.log(`\n1. Integration fields on ${productName} objects:`);
    objectsToCheck.forEach(obj => {
      console.log(`   - ${obj}: Fields related to integration would indicate ${productName}-specific integrations`);
    });
    
    // API naming patterns
    console.log('\n2. API configurations with product-specific naming patterns:');
    console.log(`   - Looking for keywords: ${keywords.join(', ')}`);
    console.log('   - In Connected Apps, Named Credentials, and Auth Providers');
    
    // User activity patterns
    console.log('\n3. User activity related to integrations:');
    console.log(`   - ${productName} users actively working with the system via API`);
    
    console.log('\nThese methods help us distinguish which integrations are specific to each cloud.');
    console.log('==========================================');
  }
  
  /**
   * Analyze core support objects (Case, Contact, etc.)
   * @returns {Array} Analysis results
   */
  async analyzeCoreSupportObjects() {
    const results = [];
    
    // Check Case object (central to Service Cloud)
    const caseEvidence = await this.checkObject('Case', {
      weight: 0.9,
      requiredFields: ['Status', 'Origin', 'Priority']
    });
    
    if (caseEvidence.detected) {
      const caseUsage = await this.checkObjectUsage('Case', {
        threshold: 20
      });
      
      results.push({
        name: 'Case Management',
        detected: true,
        active: caseUsage.details.active,
        details: {
          ...caseEvidence.details,
          usage: caseUsage.details
        }
      });
    } else {
      results.push({
        name: 'Case Management',
        detected: false,
        active: false,
        details: caseEvidence.details
      });
    }
    
    // Check Case Comment
    const caseCommentEvidence = await this.checkObject('CaseComment', {
      weight: 0.7
    });
    
    if (caseCommentEvidence.detected) {
      const usage = await this.checkObjectUsage('CaseComment', {
        threshold: 10
      });
      
      results.push({
        name: 'Case Comments',
        detected: true,
        active: usage.details.active,
        details: {
          ...caseCommentEvidence.details,
          usage: usage.details
        }
      });
    } else {
      results.push({
        name: 'Case Comments',
        detected: false,
        active: false,
        details: caseCommentEvidence.details
      });
    }
    
    // Check for Case Teams
    try {
      const caseTeamQuery = "SELECT Id FROM CaseTeamMember LIMIT 1";
      const caseTeamResult = await this.connection.query(caseTeamQuery);
      results.push({
        name: 'Case Teams',
        detected: caseTeamResult.totalSize > 0,
        active: caseTeamResult.totalSize > 0,
        details: {
          message: caseTeamResult.totalSize > 0 ? 'Case Teams are being used' : 'Case Teams exist but are not used'
        }
      });
    } catch (e) {
      // If query fails, feature might not be available
      results.push({
        name: 'Case Teams',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Knowledge Management
   * @returns {Array} Analysis results
   */
  async analyzeKnowledgeManagement() {
    const results = [];
    
    // Check for Knowledge__kav object
    const knowledgeEvidence = await this.checkObject('Knowledge__kav', {
      weight: 0.8
    });
    
    if (knowledgeEvidence.detected) {
      const knowledgeUsage = await this.checkObjectUsage('Knowledge__kav', {
        threshold: 5
      });
      
      results.push({
        name: 'Knowledge Articles',
        detected: true,
        active: knowledgeUsage.details.active,
        details: {
          ...knowledgeEvidence.details,
          usage: knowledgeUsage.details
        }
      });
    } else {
      // Try checking for more recent Knowledge implementation (post API v45.0)
      try {
        const knowledgeQuery = "SELECT Id FROM Knowledge LIMIT 1";
        const knowledgeResult = await this.connection.query(knowledgeQuery);
        
        results.push({
          name: 'Knowledge Articles',
          detected: knowledgeResult.totalSize > 0,
          active: knowledgeResult.totalSize > 0,
          details: {
            message: 'Using newer Knowledge data model'
          }
        });
      } catch (e) {
        results.push({
          name: 'Knowledge Articles',
          detected: false,
          active: false,
          details: { message: 'No Knowledge implementation detected' }
        });
      }
    }
    
    return results;
  }
  
  /**
   * Analyze Service Console
   * @returns {Array} Analysis results
   */
  async analyzeServiceConsole() {
    const results = [];
    
    // Check for Service Console App
    try {
      const appQuery = "SELECT Id, Label FROM AppDefinition WHERE UiType = 'Aloha' AND Label LIKE '%Service%' LIMIT 1";
      const appResult = await this.connection.query(appQuery);
      
      results.push({
        name: 'Service Console App',
        detected: appResult.totalSize > 0,
        active: true, // If it exists, we'll assume it's active
        details: {
          apps: appResult.records.map(record => record.Label)
        }
      });
    } catch (e) {
      results.push({
        name: 'Service Console App',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Self-Service features
   * @returns {Array} Analysis results
   */
  async analyzeSelfService() {
    const results = [];
    
    // Check for Experience Cloud sites (formerly Communities)
    try {
      const networkQuery = "SELECT Id, Name FROM Network LIMIT 5";
      const networkResult = await this.connection.query(networkQuery);
      
      results.push({
        name: 'Experience Cloud Sites',
        detected: networkResult.totalSize > 0,
        active: networkResult.totalSize > 0,
        details: {
          count: networkResult.totalSize,
          sites: networkResult.records.map(record => record.Name)
        }
      });
    } catch (e) {
      results.push({
        name: 'Experience Cloud Sites',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Service Automation (Workflow, Process Builder, Flow)
   * @returns {Array} Analysis results
   */
  async analyzeServiceAutomation() {
    const results = [];
    
    // Check for Workflow Rules on Case
    try {
      // Note: WorkflowRule is available through tooling API, not standard query
      results.push({
        name: 'Case Workflow Rules',
        detected: true, // Placeholder since we can't easily query this
        active: true,
        details: { 
          message: 'Service automation detection requires additional tooling API access'
        }
      });
    } catch (e) {
      results.push({
        name: 'Case Workflow Rules',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Entitlements and SLAs
   * @returns {Array} Analysis results
   */
  async analyzeEntitlements() {
    const results = [];
    
    // Check for Entitlement object
    const entitlementEvidence = await this.checkObject('Entitlement', {
      weight: 0.7
    });
    
    if (entitlementEvidence.detected) {
      const entitlementUsage = await this.checkObjectUsage('Entitlement', {
        threshold: 1
      });
      
      results.push({
        name: 'Entitlements',
        detected: true,
        active: entitlementUsage.details.active,
        details: {
          ...entitlementEvidence.details,
          usage: entitlementUsage.details
        }
      });
    } else {
      results.push({
        name: 'Entitlements',
        detected: false,
        active: false,
        details: entitlementEvidence.details
      });
    }
    
    // Check for SLA (Service Level Agreement)
    const slaEvidence = await this.checkObject('SlaProcess', {
      weight: 0.6
    });
    
    if (slaEvidence.detected) {
      results.push({
        name: 'Service Level Agreements',
        detected: true,
        active: slaEvidence.details.recordCount > 0,
        details: slaEvidence.details
      });
    } else {
      results.push({
        name: 'Service Level Agreements',
        detected: false,
        active: false,
        details: slaEvidence.details
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Field Service features
   * @returns {Array} Analysis results
   */
  async analyzeFieldService() {
    const results = [];
    
    // Check for ServiceAppointment object (core Field Service object)
    const serviceAppointmentEvidence = await this.checkObject('ServiceAppointment', {
      weight: 0.8
    });
    
    if (serviceAppointmentEvidence.detected) {
      const usage = await this.checkObjectUsage('ServiceAppointment', {
        threshold: 5
      });
      
      results.push({
        name: 'Field Service',
        detected: true,
        active: usage.details.active,
        details: {
          ...serviceAppointmentEvidence.details,
          usage: usage.details
        }
      });
    } else {
      results.push({
        name: 'Field Service',
        detected: false,
        active: false,
        details: serviceAppointmentEvidence.details
      });
    }
    
    return results;
  }
  
  /**
   * Analyze User Activity
   * @returns {Array} Analysis results
   */
  async analyzeUserActivity() {
    const results = [];
    
    // Check for general user activity
    const userActivityEvidence = await this.checkUserActivity(null);
    
    if (userActivityEvidence.detected) {
      // Check for login activity
      if (userActivityEvidence.details.logins.count > 0) {
        results.push({
          name: 'User Logins',
          detected: true,
          active: true,
          details: {
            count: userActivityEvidence.details.logins.count,
            message: `${userActivityEvidence.details.logins.count} logins in the last 30 days`
          }
        });
      } else {
        results.push({
          name: 'User Logins',
          detected: false,
          active: false,
          details: { message: 'No recent logins detected' }
        });
      }
      
      // Check for reports
      if (userActivityEvidence.details.reports.count > 0) {
        results.push({
          name: 'Reports Usage',
          detected: true,
          active: userActivityEvidence.details.reports.items.some(r => r.lastRun),
          details: {
            count: userActivityEvidence.details.reports.count,
            reports: userActivityEvidence.details.reports.items
          }
        });
      } else {
        results.push({
          name: 'Reports Usage',
          detected: false,
          active: false,
          details: { message: 'No reports detected' }
        });
      }
      
      // Check for dashboards
      if (userActivityEvidence.details.dashboards.count > 0) {
        results.push({
          name: 'Dashboards',
          detected: true,
          active: userActivityEvidence.details.dashboards.count > 0,
          details: {
            count: userActivityEvidence.details.dashboards.count,
            dashboards: userActivityEvidence.details.dashboards.items
          }
        });
      } else {
        results.push({
          name: 'Dashboards',
          detected: false,
          active: false,
          details: { message: 'No dashboards detected' }
        });
      }
      
      // Check for list views
      if (userActivityEvidence.details.listViews.count > 0) {
        results.push({
          name: 'List Views',
          detected: true,
          active: userActivityEvidence.details.listViews.count > 0,
          details: {
            count: userActivityEvidence.details.listViews.count,
            message: `${userActivityEvidence.details.listViews.count} list views configured`
          }
        });
      } else {
        results.push({
          name: 'List Views',
          detected: false,
          active: false,
          details: { message: 'No list views detected' }
        });
      }
    } else {
      // If no activity detected, add generic items
      results.push({
        name: 'User Logins',
        detected: false,
        active: false,
        details: { message: 'No recent logins detected' }
      });
      
      results.push({
        name: 'Reports & Dashboards',
        detected: false,
        active: false,
        details: { message: 'No reports or dashboards detected' }
      });
      
      results.push({
        name: 'List Views',
        detected: false,
        active: false,
        details: { message: 'No list views detected' }
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Code Customization
   * @returns {Array} Analysis results
   */
  async analyzeCodeCustomization() {
    const results = [];
    
    // Check for general code customization
    const codeEvidence = await this.checkCodeReferences(null);
    
    if (codeEvidence.detected) {
      // Check for Apex triggers
      if (codeEvidence.details.triggers.count > 0) {
        const caseTriggers = codeEvidence.details.triggers.items.filter(t => 
          t.object === 'Case' || t.name.toLowerCase().includes('case'));
          
        results.push({
          name: 'Case Triggers',
          detected: caseTriggers.length > 0,
          active: caseTriggers.length > 0,
          details: {
            count: caseTriggers.length,
            triggers: caseTriggers.map(t => t.name)
          }
        });
        
        const knowledgeTriggers = codeEvidence.details.triggers.items.filter(t => 
          t.object === 'Knowledge__kav' || t.name.toLowerCase().includes('knowledge'));
          
        results.push({
          name: 'Knowledge Triggers',
          detected: knowledgeTriggers.length > 0,
          active: knowledgeTriggers.length > 0,
          details: {
            count: knowledgeTriggers.length,
            triggers: knowledgeTriggers.map(t => t.name)
          }
        });
      } else {
        results.push({
          name: 'Case Triggers',
          detected: false,
          active: false,
          details: { message: 'No Case triggers detected' }
        });
        
        results.push({
          name: 'Knowledge Triggers',
          detected: false,
          active: false,
          details: { message: 'No Knowledge triggers detected' }
        });
      }
      
      // Check for Lightning components
      const auraCount = codeEvidence.details.auraComponents.count;
      const lwcCount = codeEvidence.details.lwcComponents.count;
      
      if (auraCount > 0 || lwcCount > 0) {
        results.push({
          name: 'Lightning Components',
          detected: true,
          active: true,
          details: {
            auraCount: auraCount,
            lwcCount: lwcCount,
            totalCount: auraCount + lwcCount,
            components: [
              ...codeEvidence.details.auraComponents.items.map(c => ({ name: c.name, type: 'Aura' })),
              ...codeEvidence.details.lwcComponents.items.map(c => ({ name: c.name, type: 'LWC' }))
            ].slice(0, 10) // Limit to first 10 for the report
          }
        });
      } else {
        results.push({
          name: 'Lightning Components',
          detected: false,
          active: false,
          details: { message: 'No Lightning components detected' }
        });
      }
    } else {
      // If no code detected, add generic items
      results.push({
        name: 'Apex Triggers',
        detected: false,
        active: false,
        details: { message: 'No Apex triggers detected' }
      });
      
      results.push({
        name: 'Lightning Components',
        detected: false,
        active: false,
        details: { message: 'No Lightning components detected' }
      });
    }
    
    return results;
  }
  
  /**
   * Analyze Integration Points
   * @returns {Array} Analysis results
   */
  async analyzeIntegrations() {
    console.log('Analyzing Integration Points...');
    
    const results = [];
    
    // Check for general integration configurations
    const generalApiEvidence = await this.checkApiUsage(null);
    
    // In verbose mode, print detailed info about API integrations
    if (this.options.verbose) {
      console.log('\n=== DETAILED API INTEGRATION ANALYSIS ===');
      console.log(JSON.stringify(generalApiEvidence.details, null, 2));
      console.log('======================================\n');
    }
    
    // Check for CTI integration
    results.push({
      name: 'CTI Integration',
      active: generalApiEvidence.detected,
      detected: generalApiEvidence.detected,
      details: generalApiEvidence.detected ? 
        { message: 'CTI integration detected' } : 
        { message: 'No CTI integration found' }
    });
    
    // Check for social customer service
    results.push({
      name: 'Social Customer Service',
      active: generalApiEvidence.detected,
      detected: generalApiEvidence.detected,
      details: generalApiEvidence.detected ? 
        { message: 'Social customer service integration detected' } : 
        { message: 'No social customer service integration found' }
    });
    
    // Check for case API integration
    const caseApiEvidence = await this.checkApiUsage('Case');
    
    // In verbose mode, print detailed info about Case API integrations
    if (this.options.verbose) {
      console.log('\n=== DETAILED CASE API INTEGRATION ANALYSIS ===');
      console.log(JSON.stringify(caseApiEvidence.details, null, 2));
      console.log('======================================\n');
    }
    
    results.push({
      name: 'Case API Calls',
      active: caseApiEvidence.detected,
      detected: caseApiEvidence.detected,
      details: caseApiEvidence.detected ? 
        { message: 'Case API integration detected' } : 
        { message: 'No Case API integration found' }
    });
    
    return {
      category: 'Integration Points',
      items: results
    };
  }
  
  /**
   * Generate summary metrics from indicator results
   * 
   * @param {Array} indicatorResults - Results from all indicators
   * @returns {Object} - Summary metrics
   */
  generateSummary(indicatorResults) {
    const totalCategories = indicatorResults.length;
    const detectedCategories = indicatorResults.filter(cat => cat.detected).length;
    const activeCategories = indicatorResults.filter(
      cat => cat.items.some(item => item.active)
    ).length;
    
    // Count total items, detected items, and active items
    let totalItems = 0;
    let detectedItems = 0;
    let activeItems = 0;
    
    for (const category of indicatorResults) {
      totalItems += category.items.length;
      detectedItems += category.items.filter(item => item.detected).length;
      activeItems += category.items.filter(item => item.active).length;
    }
    
    return {
      totalCategories,
      detectedCategories,
      activeCategories,
      totalItems,
      detectedItems,
      activeItems
    };
  }
  
  /**
   * Output the analysis results
   * @param {Object} results Analysis results
   */
  async outputResults(results) {
    const reportGenerator = require('./report-generator');
    const excelGenerator = require('./utils/excel-generator');
    const fs = require('fs');
    const path = require('path');
    
    try {
      // Generate timestamp for filenames
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      
      // Generate the usage report
      const report = reportGenerator.generateUsageReport(results);
      
      if (this.options.outputFile) {
        // Write the text report
        const textFile = this.options.outputFile;
        fs.writeFileSync(textFile, report);
        console.log(`Text report written to ${textFile}`);
        
        // Generate and write Excel report
        const excelBuffer = await excelGenerator.generateExcelReport(results);
        const excelFile = path.join(
          path.dirname(this.options.outputFile),
          `${path.basename(this.options.outputFile, path.extname(this.options.outputFile))}_${timestamp}.xlsx`
        );
        fs.writeFileSync(excelFile, excelBuffer);
        console.log(`Excel report written to ${excelFile}`);
      } else {
        // Print the report to the console
        console.log(report);
        
        // Also output the JSON if the verbose option is enabled
        if (this.options.verbose) {
          console.log('Detailed Analysis Results (JSON):');
          console.log(JSON.stringify(results, null, 2));
        }
      }
    } catch (error) {
      console.error(`Error generating reports: ${error.message}`);
    }
  }
  
  /**
   * Clean up resources
   */
  async cleanup() {
    // Skip logout for SFDX authentication to avoid Bad_Id errors
    if (this.options.useSfdx) {
      console.log('Using SFDX authentication - explicit logout not required');
      return;
    }

    try {
      // For direct authentication, try to logout
      if (this.connection.accessToken) {
        try {
          await this.connection.logout();
          console.log('Logged out of Salesforce.');
        } catch (e) {
          // Handle Bad_Id errors specially
          if (e.name === 'Bad_Id' || e.message.includes('Bad_Id')) {
            console.log('Session already invalid or expired, no need to logout.');
          } else {
            console.error(`Warning: Logout issue: ${e.message}`);
          }
        }
      } else {
        console.log('No active session to logout from.');
      }
    } catch (error) {
      console.log('Session cleanup completed with warnings.');
    }
  }

  /**
   * Check for Apex code customizations
   * 
   * @param {string} objectName - API name of the object to check code for
   * @param {Object} options - Options for detection
   * @returns {Promise<Evidence>} - Evidence about code customizations
   */
  async checkCodeReferences(objectName, options = {}) {
    try {
      // Check for Apex triggers
      let triggerQuery = `SELECT Id, Name, TableEnumOrId, Status FROM ApexTrigger`;
      if (objectName) {
        triggerQuery += ` WHERE TableEnumOrId = '${objectName}'`;
      }
      triggerQuery += ' LIMIT 50';
      
      let triggers = [];
      try {
        const result = await this.connection.query(triggerQuery);
        triggers = result.records;
      } catch (e) {
        console.log(`Warning: Could not query ApexTrigger: ${e.message}`);
      }
      
      // Check for Apex classes that might reference this object
      let classQuery = `SELECT Id, Name FROM ApexClass`;
      if (objectName) {
        // This is a simple check; real implementation would use Tooling API for code content search
        classQuery += ` WHERE Name LIKE '%${objectName}%'`;
      }
      classQuery += ' LIMIT 50';
      
      let classes = [];
      try {
        const result = await this.connection.query(classQuery);
        classes = result.records;
      } catch (e) {
        console.log(`Warning: Could not query ApexClass: ${e.message}`);
      }
      
      // Check for Lightning components (very basic check)
      let componentQuery = `SELECT Id, DeveloperName FROM AuraDefinitionBundle LIMIT 50`;
      let components = [];
      try {
        const result = await this.connection.query(componentQuery);
        components = result.records;
      } catch (e) {
        console.log(`Warning: Could not query AuraDefinitionBundle: ${e.message}`);
      }
      
      // Check for Lightning web components
      let lwcQuery = `SELECT Id, DeveloperName FROM LightningComponentBundle LIMIT 50`;
      let lwcComponents = [];
      try {
        const result = await this.connection.query(lwcQuery);
        lwcComponents = result.records;
      } catch (e) {
        // LWC might not be accessible in older API versions
        console.log(`Warning: Could not query LightningComponentBundle: ${e.message}`);
      }
      
      const totalCodeCustomizations = triggers.length + classes.length + components.length + lwcComponents.length;
      
      return new Evidence(
        'codeReferences',
        objectName ? `${objectName} Code` : 'Code Customizations',
        totalCodeCustomizations > 0,
        options.weight || 0.8,
        {
          triggers: {
            count: triggers.length,
            items: triggers.map(t => ({ name: t.Name, object: t.TableEnumOrId, status: t.Status }))
          },
          classes: {
            count: classes.length,
            items: classes.map(c => ({ name: c.Name }))
          },
          auraComponents: {
            count: components.length,
            items: components.map(c => ({ name: c.DeveloperName }))
          },
          lwcComponents: {
            count: lwcComponents.length,
            items: lwcComponents.map(c => ({ name: c.DeveloperName }))
          },
          totalCount: totalCodeCustomizations
        }
      );
    } catch (error) {
      console.error(`Error checking code references: ${error.message}`);
      return new Evidence(
        'codeReferences',
        objectName ? `${objectName} Code` : 'Code Customizations',
        false,
        options.weight || 0.8,
        { error: error.message }
      );
    }
  }

  /**
   * Check for user activity related to an object or feature
   * 
   * @param {string} objectName - API name of the object to check activity for
   * @param {Object} options - Options for detection
   * @returns {Promise<Evidence>} - Evidence about user activity
   */
  async checkUserActivity(objectName, options = {}) {
    try {
      // Check for login activity
      let loginQuery = `SELECT Id, UserId, LoginTime, Status FROM LoginHistory WHERE LoginTime = LAST_N_DAYS:30 ORDER BY LoginTime DESC LIMIT 100`;
      let logins = [];
      try {
        const result = await this.connection.query(loginQuery);
        logins = result.records;
      } catch (e) {
        console.log(`Warning: Could not query LoginHistory: ${e.message}`);
      }
      
      // Check for reports related to the object
      let reportQuery = `SELECT Id, Name, LastRunDate FROM Report WHERE Format != 'Tabular'`;
      if (objectName) {
        // This is a very simple heuristic; real implementation would be more sophisticated
        reportQuery += ` AND Name LIKE '%${objectName}%'`;
      }
      reportQuery += ` ORDER BY LastRunDate DESC NULLS LAST LIMIT 50`;
      
      let reports = [];
      try {
        const result = await this.connection.tooling.query(reportQuery);
        reports = result.records;
      } catch (e) {
        console.log(`Warning: Could not query Report: ${e.message}`);
        // Fallback to checking report folders
        try {
          const folderQuery = `SELECT Id, Name FROM Folder WHERE Type = 'Report' LIMIT 50`;
          const folderResult = await this.connection.query(folderQuery);
          if (folderResult.records.length > 0) {
            reports = [{ name: 'Report access error but folders exist', count: folderResult.records.length }];
          }
        } catch (e2) {
          console.log(`Warning: Could not query Folder: ${e2.message}`);
        }
      }
      
      // Check for dashboards
      let dashboardQuery = `SELECT Id, Title FROM Dashboard LIMIT 50`;
      let dashboards = [];
      try {
        const result = await this.connection.tooling.query(dashboardQuery);
        dashboards = result.records;
      } catch (e) {
        console.log(`Warning: Could not query Dashboard: ${e.message}`);
        // Fallback to checking dashboard folders
        try {
          const folderQuery = `SELECT Id, Name FROM Folder WHERE Type = 'Dashboard' LIMIT 50`;
          const folderResult = await this.connection.query(folderQuery);
          if (folderResult.records.length > 0) {
            dashboards = [{ name: 'Dashboard access error but folders exist', count: folderResult.records.length }];
          }
        } catch (e2) {
          console.log(`Warning: Could not query Folder: ${e2.message}`);
        }
      }
      
      // Check for list views related to the object
      let listViewQuery = objectName 
        ? `SELECT Id, Name FROM ListView WHERE SobjectType = '${objectName}' LIMIT 50`
        : `SELECT Id, Name, SobjectType FROM ListView LIMIT 100`;
      
      let listViews = [];
      try {
        const result = await this.connection.query(listViewQuery);
        listViews = result.records;
      } catch (e) {
        console.log(`Warning: Could not query ListView: ${e.message}`);
      }
      
      const totalActivityItems = reports.length + dashboards.length + listViews.length;
      const hasLogins = logins.length > 0;
      
      return new Evidence(
        'userActivity',
        objectName ? `${objectName} Activity` : 'User Activity',
        hasLogins || totalActivityItems > 0,
        options.weight || 1.8,
        {
          logins: {
            count: logins.length,
            recentDate: logins.length > 0 ? logins[0].LoginTime : null
          },
          reports: {
            count: reports.length,
            items: reports.slice(0, 5).map(r => ({ name: r.Name, lastRun: r.LastRunDate }))
          },
          dashboards: {
            count: dashboards.length,
            items: dashboards.slice(0, 5).map(d => ({ name: d.Title || d.Name }))
          },
          listViews: {
            count: listViews.length,
            byObject: objectName ? listViews.length : this.summarizeListViewsByObject(listViews)
          },
          totalActivityItems: totalActivityItems
        }
      );
    } catch (error) {
      console.error(`Error checking user activity: ${error.message}`);
      return new Evidence(
        'userActivity',
        objectName ? `${objectName} Activity` : 'User Activity',
        false,
        options.weight || 1.8,
        { error: error.message }
      );
    }
  }

  /**
   * Summarize list views by object
   * @param {Array} listViews List of ListView records
   * @returns {Object} Summary of list views by object
   */
  summarizeListViewsByObject(listViews) {
    const summary = {};
    
    listViews.forEach(lv => {
      const objType = lv.SobjectType;
      if (!summary[objType]) {
        summary[objType] = 0;
      }
      summary[objType]++;
    });
    
    return summary;
  }

  /**
   * Check for API usage related to an object or feature
   * 
   * @param {string} objectName - API name of the object to check API usage for
   * @param {Object} options - Options for detection
   * @returns {Promise<Evidence>} - Evidence about API usage
   */
  async checkApiUsage(objectName, options = {}) {
    try {
      // Check for connected apps
      let connectedAppQuery = `SELECT Id, Name FROM ConnectedApplication LIMIT 50`;
      let connectedApps = [];
      try {
        const result = await this.connection.query(connectedAppQuery);
        connectedApps = result.records;
      } catch (e) {
        console.log(`Warning: Could not query ConnectedApplication: ${e.message}`);
      }
      
      // Check for named credentials
      let namedCredentialQuery = `SELECT Id, MasterLabel, Endpoint FROM NamedCredential LIMIT 50`;
      let namedCredentials = [];
      try {
        const result = await this.connection.query(namedCredentialQuery);
        namedCredentials = result.records;
      } catch (e) {
        console.log(`Warning: Could not query NamedCredential: ${e.message}`);
      }
      
      // Check for remote site settings
      let remoteSiteQuery = `SELECT Id, Name, Url FROM RemoteSiteSetting LIMIT 50`;
      let remoteSites = [];
      try {
        const result = await this.connection.query(remoteSiteQuery);
        remoteSites = result.records;
      } catch (e) {
        console.log(`Warning: Could not query RemoteSiteSetting: ${e.message}`);
      }
      
      // Check for auth providers
      let authProviderQuery = `SELECT Id, FriendlyName, ProviderType FROM AuthProvider LIMIT 50`;
      let authProviders = [];
      try {
        const result = await this.connection.query(authProviderQuery);
        authProviders = result.records;
      } catch (e) {
        console.log(`Warning: Could not query AuthProvider: ${e.message}`);
      }

      // New: Check for integration fields on specific objects
      let integrationFields = [];
      let objectsToCheck = [];
      
      // Determine which objects to check based on the current product being analyzed
      if (this.options.product === 'Service Cloud') {
        objectsToCheck = ['Case', 'Contact', 'Knowledge__kav'];
      } else if (this.options.product === 'Sales Cloud') {
        objectsToCheck = ['Opportunity', 'Lead', 'Account', 'Contact'];
      } else if (this.options.product === 'Experience Cloud') {
        objectsToCheck = ['Network', 'NetworkMember', 'ContentDocument', 'FeedItem'];
      } else {
        objectsToCheck = ['Case', 'Opportunity', 'Network'];
      }
      
      // Look for integration-related fields on these objects
      for (const obj of objectsToCheck) {
        try {
          const fields = await this.connection.describe(obj);
          const integrationRelatedFields = fields.fields.filter(field => 
            field.name.toLowerCase().includes('integration') || 
            field.name.toLowerCase().includes('external') || 
            field.name.toLowerCase().includes('sync') ||
            (field.description && (
              field.description.toLowerCase().includes('integration') ||
              field.description.toLowerCase().includes('external') ||
              field.description.toLowerCase().includes('sync')
            ))
          );
          
          if (integrationRelatedFields.length > 0) {
            integrationFields.push({
              object: obj,
              fields: integrationRelatedFields.map(f => ({
                name: f.name,
                label: f.label,
                description: f.description
              }))
            });
          }
        } catch (e) {
          console.log(`Warning: Could not describe ${obj}: ${e.message}`);
        }
      }
      
      // New: Check for recent API calls to specific objects
      let relevantApiCalls = false;
      
      // Filter Connected Apps by name/description to match the product
      const productSpecificConnectedApps = this.filterByProductRelevance(
        connectedApps, 
        this.options.product
      );
      
      // Filter Named Credentials by name/endpoint to match the product
      const productSpecificNamedCredentials = this.filterByProductRelevance(
        namedCredentials, 
        this.options.product
      );
      
      // Filter Remote Sites by name/url to match the product
      const productSpecificRemoteSites = this.filterByProductRelevance(
        remoteSites, 
        this.options.product
      );
      
      // Filter Auth Providers by name to match the product
      const productSpecificAuthProviders = this.filterByProductRelevance(
        authProviders, 
        this.options.product
      );
      
      const totalIntegrations = 
        productSpecificConnectedApps.length + 
        productSpecificNamedCredentials.length + 
        productSpecificRemoteSites.length + 
        productSpecificAuthProviders.length +
        integrationFields.length +
        (relevantApiCalls ? 1 : 0);
      
      const cloudSpecificName = objectName ? 
        `${objectName} API Usage` : 
        `${this.options.product} API Calls`;
      
      return new Evidence(
        'apiUsage',
        cloudSpecificName,
        totalIntegrations > 0,
        options.weight || 1.3,
        {
          connectedApps: {
            count: productSpecificConnectedApps.length,
            items: productSpecificConnectedApps.map(app => ({ name: app.Name, relevance: app.relevanceScore }))
          },
          namedCredentials: {
            count: productSpecificNamedCredentials.length,
            items: productSpecificNamedCredentials.map(cred => ({ name: cred.MasterLabel, endpoint: cred.Endpoint, relevance: cred.relevanceScore }))
          },
          remoteSites: {
            count: productSpecificRemoteSites.length,
            items: productSpecificRemoteSites.map(site => ({ name: site.Name, url: site.Url, relevance: site.relevanceScore }))
          },
          authProviders: {
            count: productSpecificAuthProviders.length,
            items: productSpecificAuthProviders.map(provider => ({ name: provider.FriendlyName, type: provider.ProviderType, relevance: provider.relevanceScore }))
          },
          integrationFields: {
            count: integrationFields.length,
            items: integrationFields
          },
          totalCount: totalIntegrations
        }
      );
    } catch (error) {
      console.error(`Error checking API usage: ${error.message}`);
      return new Evidence(
        'apiUsage',
        objectName ? `${objectName} API Usage` : 'API Integrations',
        false,
        options.weight || 1.3,
        { error: error.message }
      );
    }
  }

  /**
   * Filter integration components by their relevance to a specific product
   * 
   * @param {Array} items - Array of items to filter
   * @param {string} product - Product name (Service Cloud, Sales Cloud, or Experience Cloud)
   * @returns {Array} - Filtered items with relevance scores
   */
  filterByProductRelevance(items, product) {
    const serviceCloudKeywords = [
      'case', 'service', 'support', 'ticket', 'incident', 
      'knowledge', 'article', 'kav', 'customer', 'help',
      'field service', 'entitlement', 'sla', 'cti', 'telephony'
    ];
    
    const salesCloudKeywords = [
      'opportunity', 'lead', 'account', 'contact', 'sales',
      'campaign', 'quote', 'product', 'price', 'forecast',
      'territory', 'revenue', 'pipeline', 'deal', 'customer'
    ];
    
    const experienceCloudKeywords = [
      'community', 'experience', 'site', 'portal', 'network',
      'partner', 'customer', 'member', 'login', 'external',
      'self-service', 'public', 'authentication', 'cms', 'content'
    ];
    
    let keywords;
    
    switch(product) {
      case 'Service Cloud':
        keywords = serviceCloudKeywords;
        break;
      case 'Sales Cloud':
        keywords = salesCloudKeywords;
        break;
      case 'Experience Cloud':
        keywords = experienceCloudKeywords;
        break;
      default:
        keywords = [...serviceCloudKeywords, ...salesCloudKeywords, ...experienceCloudKeywords];
    }
    
    // Debug log for integration filtering
    if (this.options.verbose) {
      console.log(`\nFiltering ${items.length} integrations for ${product} relevance:`);
    }
    
    const filteredItems = items.map(item => {
      const itemString = JSON.stringify(item).toLowerCase();
      let relevanceScore = 0;
      let matchedKeywords = [];
      
      // Check if any keywords match
      keywords.forEach(keyword => {
        if (itemString.includes(keyword.toLowerCase())) {
          relevanceScore += 1;
          matchedKeywords.push(keyword);
        }
      });
      
      // If no direct keyword matches but we have items, give minimal relevance
      if (relevanceScore === 0) {
        relevanceScore = 0.2; // Minimal relevance for generic integrations
      }
      
      // Debug log for each item
      if (this.options.verbose && relevanceScore > 0.2) {
        const name = item.Name || item.MasterLabel || item.FriendlyName || 'Unknown';
        console.log(`  - ${name}: relevance ${relevanceScore} [matches: ${matchedKeywords.join(', ')}]`);
      }
      
      // Add relevance score to the item
      return { ...item, relevanceScore, matchedKeywords };
    }).filter(item => item.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // Debug summary
    if (this.options.verbose) {
      console.log(`  Found ${filteredItems.length} relevant integrations for ${product}\n`);
    }
    
    return filteredItems;
  }

  /**
   * Calculate category-specific usage scores
   * @param {Object} results - Analysis results
   * @returns {Object} - Category scores
   */
  calculateCategoryScores(results) {
    const categoryScores = {};
    
    // Group results by category
    const categorizedResults = {};
    results.forEach(result => {
      if (!categorizedResults[result.category]) {
        categorizedResults[result.category] = [];
      }
      categorizedResults[result.category].push(result);
    });
    
    // Calculate scores for each category
    Object.keys(categorizedResults).forEach(category => {
      const categoryItems = categorizedResults[category];
      const totalItems = categoryItems.length;
      const detectedItems = categoryItems.filter(item => item.detected).length;
      const activeItems = categoryItems.filter(item => item.detected && item.active).length;
      
      categoryScores[category] = {
        name: category,
        totalItems,
        detectedItems,
        activeItems,
        detectionRate: Math.round((detectedItems / totalItems) * 100),
        usageRate: Math.round((activeItems / totalItems) * 100)
      };
    });
    
    return categoryScores;
  }

  /**
   * Generate a usage report from analysis results
   * @param {string} productName - Name of the product being analyzed
   * @param {Array} results - Analysis results
   * @returns {string} - Formatted usage report
   */
  generateReport(productName, results) {
    // ... existing code ...
    
    // Calculate category scores
    const categoryScores = this.calculateCategoryScores(results);
    
    // ... existing code ...
    
    // Add category breakdown section
    output += '\nCATEGORY BREAKDOWN\n';
    output += '----------------\n';
    Object.values(categoryScores).forEach(category => {
      output += `${category.name}: ${category.usageRate}% utilized (${category.activeItems}/${category.totalItems} features)\n`;
      if (category.activeItems > 0) {
        output += `   Active features: ${results.filter(r => r.category === category.name && r.detected && r.active).map(r => r.name).join(', ')}\n`;
      }
      if (category.detectedItems > category.activeItems) {
        output += `   Available but unused: ${results.filter(r => r.category === category.name && r.detected && !r.active).map(r => r.name).join(', ')}\n`;
      }
      output += '\n';
    });
    
    // ... existing code ...
    
    return output;
  }

  /**
   * Analyze a specific indicator category
   * 
   * @param {Object} category - The indicator category to analyze
   * @returns {Object} - Category analysis results
   */
  async analyzeCategory(category) {
    // Create result container for this category
    const categoryResult = {
      category: category.category,
      detected: false,
      items: []
    };
    
    // If there are no items defined in this category, look for a hardcoded approach
    if (!category.items || category.items.length === 0) {
      // Special handling for service cloud categories
      switch (category.category) {
        case "Core Support Objects":
          categoryResult.items = await this.analyzeCoreSupportObjects();
          break;
        case "Knowledge Management":
          categoryResult.items = await this.analyzeKnowledgeManagement();
          break;
        case "Service Console":
          categoryResult.items = await this.analyzeServiceConsole();
          break;
        case "Customer Self-Service":
          categoryResult.items = await this.analyzeSelfService();
          break;
        case "Service Automation":
          categoryResult.items = await this.analyzeServiceAutomation();
          break;
        case "Entitlements and SLAs":
          categoryResult.items = await this.analyzeEntitlements();
          break;
        case "Field Service":
          categoryResult.items = await this.analyzeFieldService();
          break;
        case "User Activity":
          categoryResult.items = await this.analyzeUserActivity();
          break;
        case "Integration Points":
          categoryResult.items = await this.analyzeIntegrations();
          break;
        case "Code Customization":
          categoryResult.items = await this.analyzeCodeCustomization();
          break;
        // Experience Cloud specific categories
        case "Core Components":
          categoryResult.items = await this.analyzeCoreComponents();
          break;
        case "Content Management":
          categoryResult.items = await this.analyzeContentManagement();
          break;
        case "Engagement Features":
          categoryResult.items = await this.analyzeEngagementFeatures();
          break;
        case "Advanced Authentication":
          categoryResult.items = await this.analyzeAdvancedAuthentication();
          break;
        case "Advanced Content Features":
          categoryResult.items = await this.analyzeAdvancedContentFeatures();
          break;
        default:
          console.log(`No analysis method for category: ${category.category}`);
          categoryResult.items.push({
            name: "Not implemented",
            detected: false,
            details: { message: "Analysis for this category is not yet implemented" }
          });
      }
    } else {
      // Process each item in the category
      for (const item of category.items) {
        let evidenceItem;
        
        // Check for the item based on its type
        switch (item.type) {
          case 'object':
            const objectEvidence = await this.checkObject(item.name, {
              weight: item.weight,
              requiredFields: item.requiredFields
            });
            
            if (objectEvidence.detected) {
              const usageEvidence = await this.checkObjectUsage(item.name, {
                threshold: item.activityThreshold || 10
              });
              
              evidenceItem = {
                name: item.name,
                detected: true,
                active: usageEvidence.details.active,
                details: {
                  ...objectEvidence.details,
                  usage: usageEvidence.details
                }
              };
            } else {
              evidenceItem = {
                name: item.name,
                detected: false,
                active: false,
                details: objectEvidence.details
              };
            }
            break;
            
          case 'feature':
            const featureEvidence = await this.checkFeature(item.name, {
              weight: item.weight,
              detectionMethods: item.detectionMethods
            });
            
            evidenceItem = {
              name: item.name,
              detected: featureEvidence.detected,
              active: featureEvidence.details.active || false,
              details: featureEvidence.details
            };
            break;
            
          case 'code':
            const codeEvidence = await this.checkCodeReferences(
              item.name,
              {
                weight: item.weight,
                patterns: item.patterns,
                objectName: item.objectName
              }
            );
            
            evidenceItem = {
              name: item.name,
              detected: codeEvidence.detected,
              active: codeEvidence.details.active || false,
              details: codeEvidence.details
            };
            break;
            
          case 'activity':
            const activityEvidence = await this.checkUserActivity(
              item.name,
              {
                weight: item.weight,
                patterns: item.patterns,
                threshold: item.threshold
              }
            );
            
            evidenceItem = {
              name: item.name,
              detected: activityEvidence.detected,
              active: activityEvidence.details.active || false,
              details: activityEvidence.details
            };
            break;
            
          case 'api':
          case 'integration':
            const apiEvidence = await this.checkApiUsage(
              item.name,
              {
                weight: item.weight,
                patterns: item.patterns,
                threshold: item.threshold
              }
            );
            
            evidenceItem = {
              name: item.name,
              detected: apiEvidence.detected,
              active: apiEvidence.details.active || false,
              details: apiEvidence.details
            };
            break;
            
          default:
            console.warn(`Unknown item type: ${item.type}`);
            continue;
        }
        
        // Add the evidence item to the results
        categoryResult.items.push(evidenceItem);
      }
    }
    
    // Mark this category as detected if any items were detected
    const detectedItems = categoryResult.items.filter(item => item.detected);
    categoryResult.detected = detectedItems.length > 0;
    
    // Calculate active vs detected items
    categoryResult.totalItems = categoryResult.items.length;
    categoryResult.detectedItems = detectedItems.length;
    categoryResult.activeItems = categoryResult.items.filter(item => item.detected && item.active).length;
    
    return categoryResult;
  }

  /**
   * Analyze core Experience Cloud components
   * @returns {Array} Analysis results
   */
  async analyzeCoreComponents() {
    const results = [];
    
    // Check Network object (central to Experience Cloud)
    const networkEvidence = await this.checkObject('Network', {
      weight: 0.9,
      requiredFields: ['Status', 'Name']
    });
    
    if (networkEvidence.detected) {
      const networkUsage = await this.checkObjectUsage('Network', {
        threshold: 1
      });
      
      results.push({
        name: 'Experience Sites',
        detected: true,
        active: networkUsage.details.active,
        details: {
          ...networkEvidence.details,
          usage: networkUsage.details
        }
      });
    } else {
      results.push({
        name: 'Experience Sites',
        detected: false,
        active: false,
        details: networkEvidence.details
      });
    }
    
    // Check NetworkMember
    const memberEvidence = await this.checkObject('NetworkMember', {
      weight: 0.8
    });
    
    if (memberEvidence.detected) {
      const usage = await this.checkObjectUsage('NetworkMember', {
        threshold: 10
      });
      
      results.push({
        name: 'Experience Members',
        detected: true,
        active: usage.details.active,
        details: {
          ...memberEvidence.details,
          usage: usage.details
        }
      });
    } else {
      results.push({
        name: 'Experience Members',
        detected: false,
        active: false,
        details: memberEvidence.details
      });
    }
    
    // Check ExperienceBundle
    try {
      const bundleQuery = "SELECT Id, MasterLabel FROM ExperienceBundle LIMIT 5";
      const bundleResult = await this.connection.query(bundleQuery);
      results.push({
        name: 'Experience Builder',
        detected: bundleResult.totalSize > 0,
        active: bundleResult.totalSize > 0,
        details: {
          message: bundleResult.totalSize > 0 ? 
            `Experience Builder is being used (${bundleResult.totalSize} experiences found)` : 
            'Experience Builder is not being used'
        }
      });
    } catch (e) {
      // If query fails, feature might not be available
      results.push({
        name: 'Experience Builder',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check NetworkActivityAudit
    const activityEvidence = await this.checkObject('NetworkActivityAudit', {
      weight: 0.6
    });
    
    if (activityEvidence.detected) {
      const usage = await this.checkObjectUsage('NetworkActivityAudit', {
        threshold: 20
      });
      
      results.push({
        name: 'Experience Activity',
        detected: true,
        active: usage.details.active,
        details: {
          ...activityEvidence.details,
          usage: usage.details
        }
      });
    } else {
      results.push({
        name: 'Experience Activity',
        detected: false,
        active: false,
        details: activityEvidence.details
      });
    }
    
    return results;
  }

  /**
   * Analyze Experience Cloud content management
   * @returns {Array} Analysis results
   */
  async analyzeContentManagement() {
    const results = [];
    
    // Check ContentDocument for shared files
    const contentEvidence = await this.checkObject('ContentDocument', {
      weight: 0.7
    });
    
    if (contentEvidence.detected) {
      const contentUsage = await this.checkObjectUsage('ContentDocument', {
        threshold: 15
      });
      
      results.push({
        name: 'Content Sharing',
        detected: true,
        active: contentUsage.details.active,
        details: {
          ...contentEvidence.details,
          usage: contentUsage.details
        }
      });
    } else {
      results.push({
        name: 'Content Sharing',
        detected: false,
        active: false,
        details: contentEvidence.details
      });
    }
    
    // Check CMS Settings
    try {
      const cmsQuery = "SELECT Id, MasterLabel FROM ManagedContentType LIMIT 5";
      const cmsResult = await this.connection.query(cmsQuery);
      results.push({
        name: 'CMS for Experience Cloud',
        detected: cmsResult.totalSize > 0,
        active: cmsResult.totalSize > 0,
        details: {
          message: cmsResult.totalSize > 0 ? 
            `CMS is configured (${cmsResult.totalSize} content types found)` : 
            'CMS is not configured'
        }
      });
    } catch (e) {
      // If query fails, feature might not be available
      results.push({
        name: 'CMS for Experience Cloud',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check Topics
    const topicsEvidence = await this.checkObject('Topic', {
      weight: 0.6
    });
    
    if (topicsEvidence.detected) {
      const topicsUsage = await this.checkObjectUsage('Topic', {
        threshold: 5
      });
      
      results.push({
        name: 'Topics',
        detected: true,
        active: topicsUsage.details.active,
        details: {
          ...topicsEvidence.details,
          usage: topicsUsage.details
        }
      });
    } else {
      results.push({
        name: 'Topics',
        detected: false,
        active: false,
        details: topicsEvidence.details
      });
    }
    
    // Check Knowledge Integration with Experience
    try {
      const knowledgeQuery = "SELECT Id FROM KnowledgeSettings WHERE NetworkEnabled = true LIMIT 1";
      const knowledgeResult = await this.connection.query(knowledgeQuery);
      results.push({
        name: 'Knowledge Integration',
        detected: knowledgeResult.totalSize > 0,
        active: knowledgeResult.totalSize > 0,
        details: {
          message: knowledgeResult.totalSize > 0 ? 
            'Knowledge is integrated with Experience Cloud' : 
            'Knowledge is not integrated with Experience Cloud'
        }
      });
    } catch (e) {
      // Try alternate approach if the query fails
      try {
        const networkKnowledgeQuery = "SELECT Id FROM NetworkTabSet WHERE TabType = 'Knowledge' LIMIT 1";
        const networkKnowledgeResult = await this.connection.query(networkKnowledgeQuery);
        results.push({
          name: 'Knowledge Integration',
          detected: networkKnowledgeResult.totalSize > 0,
          active: networkKnowledgeResult.totalSize > 0,
          details: {
            message: networkKnowledgeResult.totalSize > 0 ? 
              'Knowledge tab is available in Experience Cloud' : 
              'Knowledge tab is not available in Experience Cloud'
          }
        });
      } catch (e2) {
        results.push({
          name: 'Knowledge Integration',
          detected: false,
          active: false,
          details: { error: e2.message }
        });
      }
    }
    
    return results;
  }

  /**
   * Analyze Experience Cloud engagement features
   * @returns {Array} Analysis results
   */
  async analyzeEngagementFeatures() {
    const results = [];
    
    // Check FeedItem for Chatter posts
    const feedEvidence = await this.checkObject('FeedItem', {
      weight: 0.8
    });
    
    if (feedEvidence.detected) {
      const feedUsage = await this.checkObjectUsage('FeedItem', {
        threshold: 30,
        timeField: 'CreatedDate'
      });
      
      results.push({
        name: 'Chatter Collaboration',
        detected: true,
        active: feedUsage.details.active,
        details: {
          ...feedEvidence.details,
          usage: feedUsage.details
        }
      });
    } else {
      results.push({
        name: 'Chatter Collaboration',
        detected: false,
        active: false,
        details: feedEvidence.details
      });
    }
    
    // Check FeedComment for conversation engagement
    const commentEvidence = await this.checkObject('FeedComment', {
      weight: 0.7
    });
    
    if (commentEvidence.detected) {
      const commentUsage = await this.checkObjectUsage('FeedComment', {
        threshold: 40,
        timeField: 'CreatedDate'
      });
      
      results.push({
        name: 'Chatter Comments',
        detected: true,
        active: commentUsage.details.active,
        details: {
          ...commentEvidence.details,
          usage: commentUsage.details
        }
      });
    } else {
      results.push({
        name: 'Chatter Comments',
        detected: false,
        active: false,
        details: commentEvidence.details
      });
    }
    
    // Check Question object for Q&A functionality
    const questionEvidence = await this.checkObject('Question', {
      weight: 0.7
    });
    
    if (questionEvidence.detected) {
      const questionUsage = await this.checkObjectUsage('Question', {
        threshold: 10
      });
      
      results.push({
        name: 'Question & Answer',
        detected: true,
        active: questionUsage.details.active,
        details: {
          ...questionEvidence.details,
          usage: questionUsage.details
        }
      });
    } else {
      results.push({
        name: 'Question & Answer',
        detected: false,
        active: false,
        details: questionEvidence.details
      });
    }
    
    // Check Idea object for ideation
    const ideaEvidence = await this.checkObject('Idea', {
      weight: 0.6
    });
    
    if (ideaEvidence.detected) {
      const ideaUsage = await this.checkObjectUsage('Idea', {
        threshold: 5
      });
      
      results.push({
        name: 'Ideas',
        detected: true,
        active: ideaUsage.details.active,
        details: {
          ...ideaEvidence.details,
          usage: ideaUsage.details
        }
      });
    } else {
      results.push({
        name: 'Ideas',
        detected: false,
        active: false,
        details: ideaEvidence.details
      });
    }
    
    // Check Reputation Management
    try {
      const reputationQuery = "SELECT Id FROM ReputationLevel LIMIT 5";
      const reputationResult = await this.connection.query(reputationQuery);
      results.push({
        name: 'Reputation Management',
        detected: reputationResult.totalSize > 0,
        active: reputationResult.totalSize > 3, // More than default levels indicates customization
        details: {
          message: reputationResult.totalSize > 0 ? 
            `Reputation management is configured (${reputationResult.totalSize} levels)` : 
            'Reputation management is not configured'
        }
      });
    } catch (e) {
      results.push({
        name: 'Reputation Management',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }

  /**
   * Analyze advanced authentication features for Experience Cloud
   * @returns {Array} Analysis results
   */
  async analyzeAdvancedAuthentication() {
    const results = [];
    
    // Check for SSO configurations
    try {
      const ssoQuery = "SELECT Id, Name, DeveloperName FROM SamlSsoConfig LIMIT 10";
      let ssoResult;
      try {
        ssoResult = await this.connection.query(ssoQuery);
      } catch (e) {
        console.warn("Could not query SamlSsoConfig: " + e.message);
        ssoResult = { totalSize: 0, records: [] };
      }
      
      // Also check for Auth Providers
      const authProviderQuery = "SELECT Id, FriendlyName, ProviderType FROM AuthProvider LIMIT 10";
      let authProviderResult;
      try {
        authProviderResult = await this.connection.query(authProviderQuery);
      } catch (e) {
        console.warn("Could not query AuthProvider: " + e.message);
        authProviderResult = { totalSize: 0, records: [] };
      }
      
      const isSSODetected = ssoResult.totalSize > 0 || authProviderResult.totalSize > 0;
      const providerNames = [
        ...ssoResult.records.map(r => r.Name || r.DeveloperName),
        ...authProviderResult.records.map(r => `${r.FriendlyName} (${r.ProviderType})`)
      ];
      
      results.push({
        name: 'Single Sign-On (SSO)',
        detected: isSSODetected,
        active: isSSODetected, // Assuming if configured, it's active
        details: {
          message: isSSODetected ? 
            `SSO is configured with ${ssoResult.totalSize + authProviderResult.totalSize} provider(s): ${providerNames.join(', ')}` : 
            'No SSO configuration detected',
          samlConfigs: ssoResult.totalSize,
          authProviders: authProviderResult.totalSize
        }
      });
    } catch (e) {
      results.push({
        name: 'Single Sign-On (SSO)',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for Passwordless Login
    try {
      // Check for login flows that might indicate passwordless login
      const loginFlowQuery = "SELECT Id, DeveloperName FROM LoginFlow LIMIT 5";
      let loginFlowResult;
      try {
        loginFlowResult = await this.connection.query(loginFlowQuery);
      } catch (e) {
        console.warn("Could not query LoginFlow: " + e.message);
        loginFlowResult = { totalSize: 0 };
      }
      
      // Check for Apex classes that might implement passwordless login
      const passwordlessApexQuery = "SELECT Id, Name FROM ApexClass WHERE Name LIKE '%PasswordLess%' OR Name LIKE '%Verification%' OR Name LIKE '%LoginHandler%' LIMIT 5";
      let passwordlessApexResult;
      try {
        passwordlessApexResult = await this.connection.query(passwordlessApexQuery);
      } catch (e) {
        console.warn("Could not query ApexClass for passwordless login: " + e.message);
        passwordlessApexResult = { totalSize: 0 };
      }
      
      const passwordlessDetected = loginFlowResult.totalSize > 0 || passwordlessApexResult.totalSize > 0;
      
      results.push({
        name: 'Passwordless Login',
        detected: passwordlessDetected,
        active: passwordlessDetected, // Assuming if configured, it's active
        details: {
          message: passwordlessDetected ? 
            `Passwordless login indicators found: ${loginFlowResult.totalSize} login flows, ${passwordlessApexResult.totalSize} related Apex classes` : 
            'No passwordless login indicators detected',
          loginFlows: loginFlowResult.totalSize,
          passwordlessApex: passwordlessApexResult.totalSize
        }
      });
    } catch (e) {
      results.push({
        name: 'Passwordless Login',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for Custom Login Flows
    try {
      const loginFlowQuery = "SELECT Id, DeveloperName FROM LoginFlow LIMIT 5";
      let loginFlowResult;
      try {
        loginFlowResult = await this.connection.query(loginFlowQuery);
      } catch (e) {
        console.warn("Could not query LoginFlow: " + e.message);
        loginFlowResult = { totalSize: 0, records: [] };
      }
      
      results.push({
        name: 'Custom Login Flows',
        detected: loginFlowResult.totalSize > 0,
        active: loginFlowResult.totalSize > 0,
        details: {
          message: loginFlowResult.totalSize > 0 ? 
            `${loginFlowResult.totalSize} custom login flows found: ${loginFlowResult.records.map(r => r.DeveloperName).join(', ')}` : 
            'No custom login flows detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'Custom Login Flows',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for JIT Provisioning
    try {
      // Check if any SAML configs have JIT enabled
      const jitSamlQuery = "SELECT Id, DeveloperName FROM SamlSsoConfig WHERE JitProvisioning = true LIMIT 5";
      let jitSamlResult;
      try {
        jitSamlResult = await this.connection.query(jitSamlQuery);
      } catch (e) {
        console.warn("Could not query SamlSsoConfig for JIT: " + e.message);
        jitSamlResult = { totalSize: 0 };
      }
      
      // Also check for Apex classes that might implement JIT
      const jitApexQuery = "SELECT Id, Name FROM ApexClass WHERE Name LIKE '%JIT%' OR Name LIKE '%UserProvisioning%' LIMIT 5";
      let jitApexResult;
      try {
        jitApexResult = await this.connection.query(jitApexQuery);
      } catch (e) {
        console.warn("Could not query ApexClass for JIT: " + e.message);
        jitApexResult = { totalSize: 0 };
      }
      
      const jitDetected = jitSamlResult.totalSize > 0 || jitApexResult.totalSize > 0;
      
      results.push({
        name: 'Just-in-time User Provisioning',
        detected: jitDetected,
        active: jitDetected,
        details: {
          message: jitDetected ? 
            `JIT provisioning indicators found: ${jitSamlResult.totalSize} SAML configs with JIT, ${jitApexResult.totalSize} related Apex classes` : 
            'No JIT provisioning indicators detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'Just-in-time User Provisioning',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for MFA
    try {
      // Check session settings for MFA
      const sessionSettingsQuery = "SELECT Id FROM SessionSettings WHERE HasSessionLevelSecurityEnabled = true LIMIT 1";
      let sessionSettingsResult;
      try {
        sessionSettingsResult = await this.connection.query(sessionSettingsQuery);
      } catch (e) {
        console.warn("Could not query SessionSettings: " + e.message);
        sessionSettingsResult = { totalSize: 0 };
      }
      
      // Also check for TwoFactor info
      const twoFactorQuery = "SELECT Id FROM TwoFactorInfo LIMIT 1";
      let twoFactorResult;
      try {
        twoFactorResult = await this.connection.query(twoFactorQuery);
      } catch (e) {
        console.warn("Could not query TwoFactorInfo: " + e.message);
        twoFactorResult = { totalSize: 0 };
      }
      
      const mfaDetected = sessionSettingsResult.totalSize > 0 || twoFactorResult.totalSize > 0;
      
      results.push({
        name: 'Multi-factor Authentication',
        detected: mfaDetected,
        active: mfaDetected,
        details: {
          message: mfaDetected ? 
            'MFA is configured in this org' : 
            'No MFA configuration detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'Multi-factor Authentication',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }

  /**
   * Analyze advanced content features for Experience Cloud
   * @returns {Array} Analysis results
   */
  async analyzeAdvancedContentFeatures() {
    const results = [];
    
    // Check for Multi-language Support
    try {
      // Check for translations
      const translationsQuery = "SELECT Id, Language FROM Translations LIMIT 10";
      let translationsResult;
      try {
        translationsResult = await this.connection.query(translationsQuery);
      } catch (e) {
        console.warn("Could not query Translations: " + e.message);
        translationsResult = { totalSize: 0, records: [] };
      }
      
      // Check for language settings in Experience bundles
      const languagesDetected = translationsResult.totalSize > 0;
      const languages = translationsResult.records.map(r => r.Language).join(', ');
      
      results.push({
        name: 'Multi-language Support',
        detected: languagesDetected,
        active: languagesDetected,
        details: {
          message: languagesDetected ? 
            `Multi-language support is configured with ${translationsResult.totalSize} languages: ${languages}` : 
            'No multi-language support detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'Multi-language Support',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for SEO Optimization
    try {
      // Check for static resources that might indicate SEO (sitemap, robots.txt)
      const seoResourcesQuery = "SELECT Id, Name FROM StaticResource WHERE Name LIKE '%sitemap%' OR Name LIKE '%robots%' OR Name LIKE '%seo%' LIMIT 5";
      let seoResourcesResult;
      try {
        seoResourcesResult = await this.connection.query(seoResourcesQuery);
      } catch (e) {
        console.warn("Could not query StaticResource for SEO: " + e.message);
        seoResourcesResult = { totalSize: 0, records: [] };
      }
      
      const seoDetected = seoResourcesResult.totalSize > 0;
      const seoResources = seoResourcesResult.records.map(r => r.Name).join(', ');
      
      results.push({
        name: 'SEO Optimization',
        detected: seoDetected,
        active: seoDetected,
        details: {
          message: seoDetected ? 
            `SEO optimization resources found: ${seoResources}` : 
            'No SEO optimization resources detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'SEO Optimization',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for Personalized Content
    try {
      // Check for apex classes related to personalization
      const personalizationApexQuery = "SELECT Id, Name FROM ApexClass WHERE Name LIKE '%Personaliz%' OR Name LIKE '%TargetContent%' LIMIT 5";
      let personalizationApexResult;
      try {
        personalizationApexResult = await this.connection.query(personalizationApexQuery);
      } catch (e) {
        console.warn("Could not query ApexClass for personalization: " + e.message);
        personalizationApexResult = { totalSize: 0 };
      }
      
      const personalizationDetected = personalizationApexResult.totalSize > 0;
      
      results.push({
        name: 'Personalized Content',
        detected: personalizationDetected,
        active: personalizationDetected,
        details: {
          message: personalizationDetected ? 
            `Personalized content indicators found: ${personalizationApexResult.totalSize} related Apex classes` : 
            'No personalized content indicators detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'Personalized Content',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    // Check for Advanced Search
    try {
      // Check for custom search implementations
      const searchApexQuery = "SELECT Id, Name FROM ApexClass WHERE Name LIKE '%Search%' AND Name NOT LIKE '%SearchController' LIMIT 5";
      let searchApexResult;
      try {
        searchApexResult = await this.connection.query(searchApexQuery);
      } catch (e) {
        console.warn("Could not query ApexClass for search: " + e.message);
        searchApexResult = { totalSize: 0, records: [] };
      }
      
      const searchDetected = searchApexResult.totalSize > 0;
      const searchClasses = searchApexResult.records.map(r => r.Name).join(', ');
      
      results.push({
        name: 'Advanced Search',
        detected: searchDetected,
        active: searchDetected,
        details: {
          message: searchDetected ? 
            `Advanced search implementations found: ${searchClasses}` : 
            'No advanced search implementations detected'
        }
      });
    } catch (e) {
      results.push({
        name: 'Advanced Search',
        detected: false,
        active: false,
        details: { error: e.message }
      });
    }
    
    return results;
  }
}

module.exports = Analyzer; 