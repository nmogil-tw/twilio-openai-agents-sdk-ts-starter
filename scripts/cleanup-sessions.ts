#!/usr/bin/env tsx

/**
 * Session cleanup script for conversation management
 * 
 * This script removes expired conversation sessions based on configurable age thresholds.
 * It can be run manually or scheduled as a cron job for automated cleanup.
 * 
 * Usage:
 *   npm run cleanup                    # Default 7 days
 *   npm run cleanup -- --days 3       # Custom 3 days
 *   npm run cleanup -- --hours 12     # Custom 12 hours
 *   npm run cleanup -- --help         # Show help
 */

import { conversationManager } from '../src/services/conversationManager';
import { logger } from '../src/utils/logger';

interface CleanupOptions {
  days?: number;
  hours?: number;
  help?: boolean;
}

function parseArgs(): CleanupOptions {
  const args = process.argv.slice(2);
  const options: CleanupOptions = {};
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--days':
      case '-d':
        options.days = parseInt(args[++i]);
        break;
      case '--hours':
      case '-h':
        options.hours = parseInt(args[++i]);
        break;
      case '--help':
        options.help = true;
        break;
    }
  }
  
  return options;
}

function showHelp(): void {
  console.log(`
Session Cleanup Script

Usage:
  npm run cleanup                    # Default 7 days
  npm run cleanup -- --days 3       # Custom 3 days  
  npm run cleanup -- --hours 12     # Custom 12 hours
  npm run cleanup -- --help         # Show this help

Options:
  --days, -d <number>    Remove sessions older than specified days (default: 7)
  --hours, -h <number>   Remove sessions older than specified hours
  --help                 Show this help message

Examples:
  npm run cleanup                    # Clean sessions older than 7 days
  npm run cleanup -- --days 1       # Clean sessions older than 1 day
  npm run cleanup -- --hours 6      # Clean sessions older than 6 hours
`);
}

async function main(): Promise<void> {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  // Calculate max age in milliseconds
  let maxAgeMs: number;
  if (options.hours !== undefined) {
    maxAgeMs = options.hours * 60 * 60 * 1000; // hours to ms
    console.log(`🧹 Cleaning up sessions older than ${options.hours} hours...`);
  } else {
    const days = options.days || 7; // Default 7 days
    maxAgeMs = days * 24 * 60 * 60 * 1000; // days to ms
    console.log(`🧹 Cleaning up sessions older than ${days} days...`);
  }
  
  const startTime = Date.now();
  
  try {
    // Perform cleanup
    const cleanedCount = await conversationManager.cleanup(maxAgeMs);
    
    const duration = Date.now() - startTime;
    
    if (cleanedCount > 0) {
      console.log(`✅ Cleanup completed successfully!`);
      console.log(`   - Sessions cleaned: ${cleanedCount}`);
      console.log(`   - Duration: ${duration}ms`);
      
      logger.info('Manual session cleanup completed', {
        operation: 'manual_cleanup'
      }, {
        cleanedCount,
        maxAgeMs,
        durationMs: duration
      });
    } else {
      console.log(`✅ No sessions needed cleanup`);
      console.log(`   - All sessions are within the age threshold`);
      console.log(`   - Duration: ${duration}ms`);
      
      logger.info('Manual session cleanup - no sessions to clean', {
        operation: 'manual_cleanup'
      }, {
        maxAgeMs,
        durationMs: duration
      });
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error(`❌ Cleanup failed:`, (error as Error).message);
    
    logger.error('Manual session cleanup failed', error as Error, {
      operation: 'manual_cleanup'
    }, {
      maxAgeMs,
      durationMs: Date.now() - startTime
    });
    
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled rejection in cleanup script', reason as Error, {
    operation: 'manual_cleanup'
  });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught exception in cleanup script', error, {
    operation: 'manual_cleanup'
  });
  process.exit(1);
});

// Run the cleanup
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}