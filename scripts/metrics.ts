#!/usr/bin/env ts-node

/**
 * Sample Event Consumer - Metrics Collection Script
 * 
 * This script demonstrates how to consume lifecycle events from the event bus
 * and collect metrics for analytics purposes.
 * 
 * Usage:
 *   npx ts-node scripts/metrics.ts
 */

import { eventBus } from '../src/events';

interface EventMetrics {
  conversation_start: number;
  conversation_end: number;
  escalation: number;
  totalConversations: number;
  totalEscalations: number;
  averageDurationMs: number;
  escalationRate: number;
}

class MetricsCollector {
  private metrics: EventMetrics = {
    conversation_start: 0,
    conversation_end: 0,
    escalation: 0,
    totalConversations: 0,
    totalEscalations: 0,
    averageDurationMs: 0,
    escalationRate: 0
  };

  private conversationDurations: number[] = [];
  private conversationStartTimes: Map<string, number> = new Map();

  constructor() {
    this.initializeEventListeners();
  }

  private initializeEventListeners(): void {
    console.log('🚀 Metrics collector starting...');
    console.log('📊 Listening for lifecycle events...\n');

    // Track conversation starts
    eventBus.on('conversation_start', (payload) => {
      this.metrics.conversation_start++;
      this.metrics.totalConversations++;
      this.conversationStartTimes.set(payload.subjectId, Date.now());
      
      console.log(`✨ Conversation started: ${payload.subjectId} (Agent: ${payload.agentName})`);
      this.printCurrentStats();
    });

    // Track conversation ends and calculate duration
    eventBus.on('conversation_end', (payload) => {
      this.metrics.conversation_end++;
      
      // Calculate duration from our tracking
      const startTime = this.conversationStartTimes.get(payload.subjectId);
      if (startTime) {
        const actualDuration = Date.now() - startTime;
        this.conversationDurations.push(actualDuration);
        this.conversationStartTimes.delete(payload.subjectId);
      } else {
        // Use provided duration if we don't have start time
        this.conversationDurations.push(payload.durationMs);
      }
      
      // Update average duration
      this.metrics.averageDurationMs = this.conversationDurations.reduce((sum, dur) => sum + dur, 0) / this.conversationDurations.length;
      
      console.log(`🏁 Conversation ended: ${payload.subjectId} (Duration: ${Math.round(payload.durationMs / 1000)}s)`);
      this.printCurrentStats();
    });

    // Track escalations
    eventBus.on('escalation', (payload) => {
      this.metrics.escalation++;
      this.metrics.totalEscalations++;
      
      // Calculate escalation rate
      this.metrics.escalationRate = this.metrics.totalConversations > 0 
        ? (this.metrics.totalEscalations / this.metrics.totalConversations) * 100 
        : 0;
      
      console.log(`🚨 Escalation occurred: ${payload.subjectId} (Level: ${payload.level})`);
      this.printCurrentStats();
    });

    console.log('✅ Event listeners initialized successfully\n');
  }

  private printCurrentStats(): void {
    console.log('📈 Current Metrics:');
    console.log(`   Conversations Started: ${this.metrics.conversation_start}`);
    console.log(`   Conversations Ended: ${this.metrics.conversation_end}`);
    console.log(`   Escalations: ${this.metrics.escalation}`);
    console.log(`   Average Duration: ${Math.round(this.metrics.averageDurationMs / 1000)}s`);
    console.log(`   Escalation Rate: ${this.metrics.escalationRate.toFixed(1)}%`);
    console.log('─'.repeat(40));
    console.log();
  }

  /**
   * Print detailed metrics report
   */
  public printDetailedReport(): void {
    console.log('\n🎯 DETAILED METRICS REPORT');
    console.log('='.repeat(50));
    console.log(`📊 Event Counts:`);
    console.log(`   • conversation_start: ${this.metrics.conversation_start}`);
    console.log(`   • conversation_end: ${this.metrics.conversation_end}`);
    console.log(`   • escalation: ${this.metrics.escalation}`);
    console.log();
    console.log(`📈 Analytics:`);
    console.log(`   • Total Conversations: ${this.metrics.totalConversations}`);
    console.log(`   • Total Escalations: ${this.metrics.totalEscalations}`);
    console.log(`   • Average Duration: ${Math.round(this.metrics.averageDurationMs / 1000)}s`);
    console.log(`   • Escalation Rate: ${this.metrics.escalationRate.toFixed(1)}%`);
    console.log();
    console.log(`🔍 Technical Info:`);
    console.log(`   • Active Conversations: ${this.conversationStartTimes.size}`);
    console.log(`   • Completed Conversations: ${this.conversationDurations.length}`);
    console.log('='.repeat(50));
  }

  /**
   * Get current metrics as JSON
   */
  public getMetrics(): EventMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset all metrics
   */
  public reset(): void {
    this.metrics = {
      conversation_start: 0,
      conversation_end: 0,
      escalation: 0,
      totalConversations: 0,
      totalEscalations: 0,
      averageDurationMs: 0,
      escalationRate: 0
    };
    this.conversationDurations = [];
    this.conversationStartTimes.clear();
    console.log('🔄 Metrics reset');
  }
}

// Run the metrics collector if this script is executed directly
if (require.main === module) {
  const collector = new MetricsCollector();
  
  // Print detailed report every 30 seconds
  const reportInterval = setInterval(() => {
    collector.printDetailedReport();
  }, 30000);

  // Graceful shutdown handling
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down metrics collector...');
    clearInterval(reportInterval);
    collector.printDetailedReport();
    console.log('👋 Goodbye!');
    process.exit(0);
  });

  // Keep the process alive
  console.log('🎯 Metrics collector is running. Press Ctrl+C to stop.');
  console.log('📊 Detailed reports will be shown every 30 seconds.\n');
}

export { MetricsCollector };