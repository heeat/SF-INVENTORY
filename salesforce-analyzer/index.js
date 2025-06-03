#!/usr/bin/env node

/**
 * Salesforce Inventory Analyzer
 * 
 * Main entry point for the analyzer tool
 */
const fs = require('fs');
const path = require('path');
const jsforce = require('jsforce');
const AnalyzerManager = require('./src/core/analyzer-manager');
const { getSfdxOrgCredentials, listSfdxOrgs, getConnectedOrgs } = require('./src/utils/sfdx-helper');
const readline = require('readline');

// Connection credentials would typically come from environment variables or config
const DEFAULT_CONNECTION_OPTIONS = {
  loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
};

// Default output options
const DEFAULT_OUTPUT_OPTIONS = {
  format: 'json',
  outputDir: './output'
};

/**
 * Prompts user to select an option from a list
 * @param {string} question The question to display
 * @param {Array<string>} options List of options to choose from
 * @returns {Promise<number>} Selected option index
 */
function promptForSelection(question, options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log(question);
  options.forEach((option, index) => {
    console.log(`${index + 1}. ${option}`);
  });

  return new Promise((resolve) => {
    rl.question('Enter selection (number): ', (answer) => {
      rl.close();
      const selection = parseInt(answer.trim(), 10);
      if (isNaN(selection) || selection < 1 || selection > options.length) {
        console.log('Invalid selection. Please try again.');
        return promptForSelection(question, options).then(resolve);
      }
      resolve(selection - 1);
    });
  });
}

/**
 * Displays a list of available SFDX orgs and allows user to choose one
 * @returns {Promise<Object>} Credentials for the selected org
 */
async function listAndChooseSfdxOrg() {
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
    const selectedIndex = await promptForSelection('Please select an org to use:', orgDisplayNames);
    const selectedOrg = orgs[selectedIndex];
    
    console.log(`Getting credentials for org: ${selectedOrg.username}`);
    const credentials = await getSfdxOrgCredentials(selectedOrg.username);
    
    return credentials;
  } catch (error) {
    console.error(`Error listing SFDX orgs: ${error.message}`);
    throw error;
  }
}

/**
 * Run a test load of the configurations without connecting to Salesforce
 * This is useful for testing that configurations are valid
 */
function testConfigurations(configDir) {
  try {
    const configLoader = require('./src/utils/config-loader');
    
    // Load main config
    const mainConfig = configLoader.loadMainConfig(
      configDir ? path.join(configDir, 'analyzer-config.json') : null
    );
    console.log('✅ Main configuration loaded successfully');
    
    // Load product definitions
    const products = configLoader.loadAllProductDefinitions(
      configDir ? path.join(configDir, 'products') : null
    );
    console.log(`✅ Loaded ${Object.keys(products).length} product configurations:`);
    
    // Print information about each product
    Object.entries(products).forEach(([_, product]) => {
      // Count indicators
      let indicatorCount = 0;
      if (Array.isArray(product.indicators)) {
        // Old format with array of indicator categories
        indicatorCount = product.indicators.reduce((sum, category) => sum + (category.items?.length || 0), 0);
      } else {
        // New format with object of categories
        indicatorCount = Object.values(product.indicators).reduce((sum, category) => sum + (category.items?.length || 0), 0);
      }
      
      console.log(`  - ${product.name}: ${indicatorCount} indicators`);
    });
    
    return { success: true, mainConfig, products };
  } catch (error) {
    console.error('❌ Error loading configurations:', error.message);
    return { success: false, error };
  }
}

/**
 * Run the analyzer with the given options
 * 
 * @param {Object} options - Options for analysis
 * @returns {Promise<Object>} - Analysis results
 */
async function runAnalysis(options = {}) {
  try {
    // Load configuration
    await loadConfiguration();

    // Parse command-line arguments
    const args = parseCommandLineArgs();
    
    // Merge provided options with command line args
    const mergedOptions = { ...args, ...options };
    
    let connectionOptions = {};
    
    // Handle authentication
    if (mergedOptions.test) {
      console.log('Running in test mode. No Salesforce connection will be established.');
    } else if (mergedOptions.useSfdx) {
      try {
        console.log('Using SFDX authentication...');
        
        // If a specific org is specified, use it
        if (mergedOptions.sfdxUsername) {
          connectionOptions = await getSfdxOrgCredentials(mergedOptions.sfdxUsername);
        } else {
          // Otherwise, list orgs and have user choose
          connectionOptions = await listAndChooseSfdxOrg();
        }
        
        console.log(`Successfully authenticated as ${connectionOptions.username}`);
      } catch (error) {
        console.error(`SFDX authentication failed: ${error.message}`);
        console.log('Falling back to direct authentication...');
      }
    }
    
    // If SFDX auth failed or wasn't requested, use direct auth
    if (!mergedOptions.test && Object.keys(connectionOptions).length === 0) {
      // Direct connection options from arguments or environment
      connectionOptions = {
        loginUrl: mergedOptions.loginUrl,
        accessToken: mergedOptions.accessToken,
        instanceUrl: mergedOptions.instanceUrl,
        username: mergedOptions.username,
        password: mergedOptions.password
      };
    }

    // If no authentication info available, exit
    if (!mergedOptions.test && 
        !connectionOptions.accessToken && 
        !(connectionOptions.username && connectionOptions.password)) {
      console.error('Error: No authentication credentials provided. Please use --sfdx or provide direct credentials.');
      process.exit(1);
    }
    
    // Establish connection to Salesforce
    const connection = await connectToSalesforce(connectionOptions);
    
    try {
      // Create analyzer manager
      const manager = new AnalyzerManager(connection, mergedOptions.configDir);
      
      // Run the analysis
      let results;
      
      if (mergedOptions.product) {
        // Run analysis for a specific product
        console.log(`Analyzing ${mergedOptions.product}...`);
        results = await manager.analyzeProduct(mergedOptions.product);
      } else {
        // Run analysis for all products
        console.log('Analyzing all products...');
        results = await manager.analyzeAll();
      }
      
      // Generate reports if requested
      if (mergedOptions.output) {
        await generateReports(results, mergedOptions.output, manager);
      }
      
      // Output results using our helper if verbose
      if (mergedOptions.verbose) {
        await outputResults(results, mergedOptions);
      }
      
      return results;
    } finally {
      // Logout at the end
      if (connection.accessToken) {
        await connection.logout();
      }
    }
  } catch (error) {
    console.error(`Analysis failed: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Connect to Salesforce
 * 
 * @param {Object} options - Connection options
 * @returns {Object} - JSForce connection
 */
async function connectToSalesforce(options) {
  const connectionOptions = {
    ...DEFAULT_CONNECTION_OPTIONS,
    ...options
  };
  
  const connection = new jsforce.Connection({
    loginUrl: connectionOptions.loginUrl
  });
  
  // If accessToken is provided, use it directly
  if (connectionOptions.accessToken && connectionOptions.instanceUrl) {
    connection.accessToken = connectionOptions.accessToken;
    connection.instanceUrl = connectionOptions.instanceUrl;
    return connection;
  }
  
  // Otherwise login with username and password
  const username = connectionOptions.username || process.env.SF_USERNAME;
  const password = connectionOptions.password || process.env.SF_PASSWORD;
  const securityToken = connectionOptions.securityToken || process.env.SF_SECURITY_TOKEN || '';
  
  if (!username || !password) {
    throw new Error('Either accessToken or username/password must be provided via arguments or environment variables (SF_USERNAME, SF_PASSWORD)');
  }
  
  await connection.login(
    username,
    password + securityToken
  );
  
  return connection;
}

/**
 * Generate reports based on the results
 * 
 * @param {Object} results - Analysis results
 * @param {Object} options - Output options
 * @param {AnalyzerManager} manager - Analyzer manager
 * @returns {Promise<void>}
 */
async function generateReports(results, options = {}, manager) {
  const outputOptions = {
    ...DEFAULT_OUTPUT_OPTIONS,
    ...options
  };
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputOptions.outputDir)) {
    fs.mkdirSync(outputOptions.outputDir, { recursive: true });
  }
  
  // Generate timestamp for filenames
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  
  // Handle single product results
  if (results.productName) {
    await generateProductReport(results, outputOptions, manager, timestamp);
    return;
  }
  
  // Handle multiple product results
  if (outputOptions.format === 'json' || outputOptions.format === 'all') {
    // Generate summary report
    const summary = manager.generateSummaryReport(results);
    const summaryPath = path.join(outputOptions.outputDir, `summary-${timestamp}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`Summary report saved to ${summaryPath}`);
    
    // Generate detailed reports for each product
    for (const [product, result] of Object.entries(results)) {
      await generateProductReport(result, outputOptions, manager, timestamp);
    }
  }
  
  // Generate CSV report for all products
  if (outputOptions.format === 'csv' || outputOptions.format === 'all') {
    const csvReport = manager.generateCsvReport(results);
    const csvPath = path.join(outputOptions.outputDir, `products-${timestamp}.csv`);
    fs.writeFileSync(csvPath, csvReport);
    console.log(`CSV report saved to ${csvPath}`);
  }
}

/**
 * Generate report for a single product
 * 
 * @param {Object} result - Analysis result for a product
 * @param {Object} options - Output options
 * @param {AnalyzerManager} manager - Analyzer manager
 * @param {string} timestamp - Timestamp for filenames
 * @returns {Promise<void>}
 */
async function generateProductReport(result, options, manager, timestamp) {
  const productName = result.productName.toLowerCase().replace(/\s+/g, '-');
  
  if (options.format === 'json' || options.format === 'all') {
    // Generate detailed JSON report
    const detailedReport = manager.generateDetailedReport(result);
    const jsonPath = path.join(options.outputDir, `${productName}-${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(detailedReport, null, 2));
    console.log(`Detailed report for ${result.productName} saved to ${jsonPath}`);
  }
  
  if (options.format === 'text' || options.format === 'all') {
    // Generate text report
    const textReport = manager.generateTextReport(result);
    const textPath = path.join(options.outputDir, `${productName}-${timestamp}.txt`);
    fs.writeFileSync(textPath, textReport);
    console.log(`Text report for ${result.productName} saved to ${textPath}`);
  }
}

/**
 * Parse command-line arguments
 * @returns {Object} Command-line options
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--loginUrl' && args[i + 1]) {
      options.loginUrl = args[++i];
    } else if (arg === '--accessToken' && args[i + 1]) {
      options.accessToken = args[++i];
    } else if (arg === '--instanceUrl' && args[i + 1]) {
      options.instanceUrl = args[++i];
    } else if (arg === '--username' && args[i + 1]) {
      options.username = args[++i];
    } else if (arg === '--password' && args[i + 1]) {
      options.password = args[++i];
    } else if (arg === '--product' && args[i + 1]) {
      options.productName = args[++i];
    } else if (arg === '--output' && args[i + 1]) {
      options.outputFile = args[++i];
    } else if (arg === '--sfdx') {
      options.useSfdx = true;
    } else if (arg === '--sfdxUsername' && args[i + 1]) {
      options.sfdxUsername = args[++i];
      options.useSfdx = true;
    } else if (arg === '--test') {
      options.test = true;
    } else if (arg === '--help') {
      options.help = true;
    }
  }

  return options;
}

/**
 * Displays help information
 */
function showHelp() {
  console.log(`
Salesforce Product Analyzer

Usage:
  node index.js [options]

Options:
  --sfdx                 Use SFDX authentication with interactive org selection
  --sfdxUsername [name]  Use SFDX authentication with a specific org (username or alias)
  --loginUrl [url]       Salesforce login URL (default: https://login.salesforce.com)
  --accessToken [token]  Salesforce access token
  --instanceUrl [url]    Salesforce instance URL
  --username [username]  Salesforce username
  --password [password]  Salesforce password
  --product [name]       Product to analyze (e.g., "Service Cloud", "Sales Cloud")
  --output [file]        Output file path (default: console output)
  --test                 Run in test mode (no Salesforce connection)
  --help                 Display this help information
  `);
}

// Main execution
(async () => {
  try {
    await runAnalysis();
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  }
})();

/**
 * Main execution function
 */
async function runAnalysis() {
  // Parse command line arguments
  const options = parseCommandLineArgs();
  
  // Show help if requested
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  // Run in test mode if requested
  if (options.test) {
    return testMode();
  }
  
  // Run the analyzer with the specified options
  const Analyzer = require('./src/analyzer');
  const analyzer = new Analyzer(options);
  await analyzer.run();
}

/**
 * Run in test mode - only load and validate configurations
 */
async function testMode() {
  const { loadConfiguration } = require('./src/config-loader');
  
  console.log('Running in test mode. No Salesforce connection will be established.');
  
  try {
    const config = await loadConfiguration();
    console.log('Main configuration loaded successfully.');
    
    if (config.products && config.products.length > 0) {
      console.log(`Loaded ${config.products.length} product configurations:`);
      config.products.forEach(product => {
        console.log(`- ${product.name}: ${product.indicators.length} indicators`);
      });
    } else {
      console.log('No product configurations found.');
    }
    
    return config;
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Output the results of the analysis
 * 
 * @param {Object} results - The analysis results
 * @param {Object} options - Output options
 */
async function outputResults(results, options = {}) {
  const reportGenerator = require('./src/report-generator');
  
  try {
    // Generate the usage report
    const report = reportGenerator.generateUsageReport(results);
    
    if (options.outputFile) {
      // Write the report to a file
      const fs = require('fs');
      try {
        fs.writeFileSync(options.outputFile, report);
        console.log(`Results written to ${options.outputFile}`);
      } catch (error) {
        console.error(`Error writing to file: ${error.message}`);
        console.log(report);
      }
    } else {
      // Print the report to the console
      console.log(report);
      
      // Also output the JSON if the verbose option is enabled
      if (options.verbose) {
        console.log('Detailed Analysis Results (JSON):');
        console.log(JSON.stringify(results, null, 2));
        
        // Add cloud-specific integration explanation
        logCloudSpecificIntegrationExplanation(results.product);
      }
    }
  } catch (error) {
    console.error(`Error generating report: ${error.message}`);
  }
}

/**
 * Log explanation of how cloud-specific integrations are detected
 */
function logCloudSpecificIntegrationExplanation(productName) {
  console.log('\n=== CLOUD-SPECIFIC INTEGRATION DETECTION ===');
  console.log(`For ${productName}, we determine specific integrations through:`);
  
  // Integration fields on cloud-specific objects
  const objectsToCheck = productName === 'Service Cloud' 
    ? ['Case', 'Contact', 'Knowledge__kav']
    : ['Opportunity', 'Lead', 'Account', 'Contact'];
  
  console.log(`\n1. Integration fields on ${productName} objects:`);
  objectsToCheck.forEach(obj => {
    console.log(`   - ${obj}: Fields related to integration would indicate ${productName}-specific integrations`);
  });
  
  // API naming patterns
  console.log('\n2. API configurations with product-specific naming patterns:');
  const keywords = productName === 'Service Cloud'
    ? ['case', 'service', 'support', 'ticket', 'knowledge']
    : ['opportunity', 'lead', 'sales', 'pipeline', 'forecast'];
  
  console.log(`   - Looking for keywords: ${keywords.join(', ')}`);
  console.log('   - In Connected Apps, Named Credentials, and Auth Providers');
  
  // User activity patterns
  console.log('\n3. User activity related to integrations:');
  console.log(`   - ${productName} users actively working with the system via API`);
  
  console.log('\nThese methods help us distinguish which integrations are specific to each cloud.');
  console.log('==========================================');
}

// Export main function for programmatic use
module.exports = {
  runAnalysis
}; 