# Salesforce Offline Analyzer

This tool performs offline analysis of Salesforce orgs by first extracting all relevant data locally and then analyzing it without requiring constant connection to the org.

## Project Structure

```
sf-offline-analyzer/
├── src/
│   ├── core/           # Core functionality and base classes
│   ├── extractors/     # Data extraction modules
│   ├── analyzers/      # Analysis modules
│   ├── reporters/      # Report generation
│   └── utils/          # Utility functions
├── data/
│   ├── metadata/       # Extracted metadata
│   ├── code/          # Extracted code
│   ├── config/        # Configuration files
│   └── reports/       # Generated reports
└── package.json
```

## Dependencies

- @salesforce/core: Core Salesforce functionality
- @salesforce/cli-plugins-apex: For Apex code extraction
- @salesforce/cli-plugins-metadata: For metadata extraction
- better-sqlite3: Local database for efficient querying
- commander: CLI interface
- fs-extra: Enhanced file system operations
- glob: File pattern matching
- winston: Logging

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure Salesforce CLI:
```bash
sf login org -a your-org-alias
```

3. Run the analyzer:
```bash
npm start
```

## Features

- Extracts org metadata using SFDX
- Stores data locally for offline analysis
- Performs feature detection
- Analyzes usage patterns
- Generates comprehensive reports

## Architecture

1. **Extraction Layer**: Uses SFDX to extract org data
2. **Storage Layer**: Manages local data storage and querying
3. **Analysis Layer**: Performs offline analysis of extracted data
4. **Reporting Layer**: Generates insights and reports 