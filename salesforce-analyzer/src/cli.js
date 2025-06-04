#!/usr/bin/env node

const Analyzer = require('./analyzer');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { execSync } = require('child_process');

// Parse command line arguments
const argv = yargs(hideBin(process.argv))
  .option('sfdx', {
    type: 'boolean',
    description: 'Use SFDX authentication'
  })
  .option('username', {
    type: 'string',
    description: 'Salesforce username'
  })
  .option('password', {
    type: 'string',
    description: 'Salesforce password'
  })
  .option('login-url', {
    type: 'string',
    description: 'Salesforce login URL',
    default: 'https://login.salesforce.com'
  })
  .option('output-file', {
    type: 'string',
    description: 'Output file path'
  })
  .option('verbose', {
    type: 'boolean',
    description: 'Enable verbose output'
  })
  .option('product-name', {
    type: 'string',
    description: 'Product to analyze',
    default: 'Experience Cloud'
  })
  .help()
  .argv;

async function main() {
  try {
    // If using SFDX, get the credentials directly
    if (argv.sfdx && argv.username) {
      console.log('Using SFDX authentication...');
      const sfdxAuthResult = execSync(`sfdx force:org:display -u ${argv.username} --json`).toString();
      const authInfo = JSON.parse(sfdxAuthResult).result;
      
      // Create analyzer instance with SFDX credentials
      const analyzer = new Analyzer({
        useSfdx: false, // We'll use the access token directly
        accessToken: authInfo.accessToken,
        instanceUrl: authInfo.instanceUrl,
        outputFile: argv.outputFile,
        verbose: argv.verbose,
        productName: argv.productName
      });

      // Run the analysis
      const results = await analyzer.run();
    } else {
      // Create analyzer instance with command line options
      const analyzer = new Analyzer({
        useSfdx: argv.sfdx,
        username: argv.username,
        password: argv.password,
        loginUrl: argv.loginUrl,
        outputFile: argv.outputFile,
        verbose: argv.verbose,
        productName: argv.productName
      });

      // Run the analysis
      const results = await analyzer.run();
    }
    
    // Exit successfully
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main(); 