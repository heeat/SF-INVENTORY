/**
 * SFDX Helper Utility
 * 
 * Provides functions for interacting with SFDX CLI to get org access details
 */
const { execSync } = require('child_process');

/**
 * Get access details for an authorized SFDX org
 * 
 * @param {string} orgName - Username or alias of the org
 * @returns {Promise<Object>} - Connection details with accessToken and instanceUrl
 */
async function getSfdxOrgCredentials(orgName) {
  try {
    // Try the new SFDX command format first
    try {
      console.log(`Getting org details for ${orgName} using new SFDX format...`);
      const output = execSync(`sfdx org display -o ${orgName} --json`).toString();
      const result = JSON.parse(output);
      
      if (result.status !== 0) {
        throw new Error(`SFDX command failed: ${result.message}`);
      }
      
      // Extract connection details
      const connectionInfo = {
        accessToken: result.result.accessToken,
        instanceUrl: result.result.instanceUrl,
        username: result.result.username,
        orgId: result.result.id
      };
      
      return connectionInfo;
    } catch (error) {
      // If new format fails, try the legacy format
      console.log(`Falling back to legacy SFDX format...`);
      const output = execSync(`sfdx force:org:display -u ${orgName} --json`).toString();
      const result = JSON.parse(output);
      
      if (result.status !== 0) {
        throw new Error(`SFDX command failed: ${result.message}`);
      }
      
      // Extract connection details
      const connectionInfo = {
        accessToken: result.result.accessToken,
        instanceUrl: result.result.instanceUrl,
        username: result.result.username,
        orgId: result.result.id
      };
      
      return connectionInfo;
    }
  } catch (error) {
    throw new Error(`Error getting org credentials: ${error.message}`);
  }
}

/**
 * List all available SFDX orgs using the auth list command
 * 
 * @returns {Promise<Array>} - List of all available orgs
 */
async function listSfdxOrgs() {
  try {
    // Execute the CLI command directly and parse the output
    const output = execSync('sfdx auth list').toString();
    console.log('Parsing SFDX auth list output...');
    
    // Get list of orgs by parsing the CLI table output
    const orgs = [];
    const lines = output.split('\n');
    
    // Find data lines (skipping header and footer)
    let dataStarted = false;
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip empty lines, warnings, and separator lines
      if (!trimmedLine || 
          trimmedLine.startsWith('Warning:') || 
          trimmedLine.startsWith('›') ||
          trimmedLine.includes('──') ||
          trimmedLine.includes('authenticated orgs')) {
        continue;
      }
      
      // Once we find the header row, we know data will follow
      if (trimmedLine.includes('Alias') && trimmedLine.includes('Username')) {
        dataStarted = true;
        continue;
      }
      
      // Process data rows
      if (dataStarted) {
        // Split the line by the table separators
        const columns = trimmedLine.split('│').map(col => col.trim());
        
        if (columns.length >= 5) {
          const aliases = columns[1].split(',').map(a => a.trim());
          const username = columns[2];
          const orgId = columns[3];
          
          orgs.push({
            username,
            alias: aliases[0] || null,
            aliases,
            orgId,
            status: 'Connected', // Assuming listed orgs are connected
            isDevHub: false // Cannot determine easily from CLI output
          });
        }
      }
    }
    
    return orgs;
  } catch (error) {
    throw new Error(`Error listing orgs: ${error.message}`);
  }
}

/**
 * Get a list of all connected orgs
 * 
 * @returns {Promise<Array>} - List of all connected orgs
 */
async function getConnectedOrgs() {
  // All orgs from auth list are considered connected
  return listSfdxOrgs();
}

module.exports = {
  getSfdxOrgCredentials,
  listSfdxOrgs,
  getConnectedOrgs
}; 