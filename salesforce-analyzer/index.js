#!/usr/bin/env node

/**
 * Salesforce Inventory Analyzer
 * 
 * Main entry point for the analyzer tool
 */
import { getConnectedOrgs, getSfdxOrgCredentials } from './src/utils/sfdx-helper.js';
import jsforce from 'jsforce';
import { AnalyzerManager } from './src/core/analyzer-manager.js';
import { generateExcelReport } from './src/utils/excel-generator.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

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
 * Show help message for authentication
 */
function showAuthHelp() {
  console.log('\nTo authorize a Salesforce org, use one of these commands:\n');
  console.log('1. Web-based login (recommended):');
  console.log('   sfdx auth:web:login\n');
  console.log('2. Device-based login (if web login fails):');
  console.log('   sfdx auth:device:login\n');
  console.log('3. Username/Password login (if you have a security token):');
  console.log('   sfdx auth:jwt:grant -u <username> -f <path/to/key> -i <clientId>\n');
  console.log('After authorizing an org, run this tool again.\n');
}

/**
 * Connect to Salesforce using SFDX credentials
 * @param {string} username - The username to connect with
 * @returns {Promise<Object>} JSForce connection
 */
async function connectToSalesforce(username) {
  try {
    const credentials = await getSfdxOrgCredentials(username);
    const conn = new jsforce.Connection({
      instanceUrl: credentials.instanceUrl,
      accessToken: credentials.accessToken
    });
    return conn;
  } catch (error) {
    console.error('Error connecting to Salesforce:', error.message);
    throw error;
  }
}

/**
 * Main function to check for authorized orgs and run analysis
 */
async function main() {
  try {
    console.log('\n=== Salesforce Inventory Analyzer ===\n');
    console.log('Checking for authorized Salesforce orgs...\n');
    
    // Check for authorized orgs
    let orgs;
    try {
      orgs = await getConnectedOrgs();
    } catch (error) {
      console.error('Error checking for authorized orgs:', error.message);
      showAuthHelp();
      process.exit(1);
    }

    // If no orgs found, show help message
    if (!orgs || orgs.length === 0) {
      console.log('No authorized Salesforce orgs found!\n');
      showAuthHelp();
      process.exit(1);
    }

    // Show available orgs
    console.log('Found authorized orgs:');
    const orgDisplayNames = orgs.map(org => `${org.alias || 'No Alias'} - ${org.username} (${org.status})`);
    orgDisplayNames.forEach((name, index) => {
      console.log(`${index + 1}. ${name}`);
    });
    console.log();

    // Prompt user to select an org
    const selectedIndex = await promptForSelection('Select an org to analyze:', orgDisplayNames);
    const selectedOrg = orgs[selectedIndex];
    
    console.log(`\nConnecting to org: ${selectedOrg.username}`);
    const connection = await connectToSalesforce(selectedOrg.username);
    console.log('Successfully connected!\n');

    // Create analyzer manager and run analysis
    const manager = new AnalyzerManager(connection);
    console.log('Starting analysis...\n');
    const results = await manager.analyzeAll();
    console.log('Analysis complete. Generating Excel report...');

    // Generate Excel report
    try {
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      
      // Debug: Log the results structure
      console.log('\nAnalysis Results Structure:');
      for (const [productKey, productData] of Object.entries(results)) {
        console.log(`\nProduct: ${productKey}`);
        console.log('Features:', productData.summary ? productData.summary.length : 0);
        if (productData.summary && productData.summary.length > 0) {
          console.log('Sample Feature:', JSON.stringify(productData.summary[0], null, 2));
        }
      }
      
      // Create reports directory if it doesn't exist
      const outputDir = path.join(process.cwd(), 'reports');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }
      
      // Generate Excel report with all results
      const excelBuffer = await generateExcelReport(results);
      const excelFile = path.join(outputDir, `salesforce_analysis_${timestamp}.xlsx`);
      fs.writeFileSync(excelFile, excelBuffer);
      console.log(`\nExcel report generated successfully at: ${excelFile}`);
      
    } catch (error) {
      console.error('\nError generating Excel report:', error.message);
      console.error('Error details:', error);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Start the application
main(); 