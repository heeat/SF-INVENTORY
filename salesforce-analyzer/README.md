# Salesforce Inventory Analyzer

A tool to analyze Salesforce orgs and determine which products and features are actively being used. Instead of just checking if components are installed, this tool performs deep analysis to calculate the probability that each Salesforce cloud or product is genuinely being used.

## Features

- **Highly Configurable**: All products and detection criteria are defined in configuration files
- **Universal Analyzer**: A single analyzer engine processes all products based on their configuration
- **Dynamic Scoring**: Calculates usage probability based on weighted evidence
- **Time-Based Analysis**: Considers recent activity more valuable than older signals
- **Deep Analysis**: Goes beyond installation status to examine actual usage patterns
- **Edition Detection**: Determines which edition of each product is likely in use
- **Comprehensive Reporting**: Provides detailed findings and recommendations

## Supported Products

Currently provides configuration for:

- Sales Cloud

Additional products can be added by creating new product definition files.

## Installation

```bash
npm install
```

## Usage

### Command Line

```bash
node index.js --username <username> --password <password> [--securityToken <token>] [--product sales-cloud]
```

Or using an access token:

```bash
node index.js --accessToken <token> --instanceUrl <url> [--product sales-cloud]
```

### Programmatic Usage

```javascript
const { runAnalysis } = require('./salesforce-analyzer');

async function analyzeOrg() {
  const results = await runAnalysis({
    connection: {
      username: 'your.username@example.com',
      password: 'yourpassword',
      securityToken: 'yourtoken'
    },
    product: 'sales-cloud' // Optional - omit to analyze all products
  });
  
  console.log(results);
}

analyzeOrg();
```

## How It Works

The analyzer operates by:

1. **Collecting Evidence**: Gathers various types of evidence from the Salesforce org, including:
   - Object presence and record counts
   - Feature configuration settings
   - User activity patterns
   - API usage statistics
   - Code customizations

2. **Weighting Evidence**: Applies appropriate weights to different types of evidence
   - User activity is weighted more heavily than mere presence
   - Recent activity is valued more than older activity

3. **Calculating Probability**: Computes an overall probability score from 0-100%
   - Scores above 70% indicate active usage
   - Scores between 30-70% indicate limited usage
   - Scores below 30% indicate minimal or no usage

4. **Generating Insights**: Provides actionable findings and recommendations based on the analysis

## Configuration

The analyzer is highly configurable through JSON files:

- `config/analyzer-config.json` - Global settings for scoring algorithms
- `config/products/*.json` - Product-specific definition files

### Product Definition Structure

Each product is defined in a JSON file with the following structure:

```json
{
  "name": "Product Name",
  "description": "Product description",
  "indicators": [
    {
      "category": "Category Name",
      "description": "Category description",
      "items": [
        {
          "type": "object|feature|activity|integration|api|code",
          "name": "Item name",
          "weight": 0.8,
          "description": "Item description",
          // Additional type-specific properties
        }
      ]
    }
  ],
  "editionSignals": {
    "Edition1": ["Signal1", "Signal2"],
    "Edition2": ["Signal3", "Signal4"]
  },
  "findingsMap": {
    "coreObjects": {
      "ObjectName": "Finding text"
    },
    "features": {
      "FeatureName": "Finding text"
    }
  },
  "recommendationsMap": {
    "active": ["Recommendation 1", "Recommendation 2"],
    "limited": ["Recommendation 3", "Recommendation 4"],
    "inactive": ["Recommendation 5", "Recommendation 6"]
  }
}
```

## Extending

To add support for additional Salesforce products:

1. Create a new product definition file in `config/products/`
2. Define all indicators, findings, and recommendations in the configuration
3. Run the analyzer with the new product key

No coding required to add new products - just configuration!

## License

MIT 