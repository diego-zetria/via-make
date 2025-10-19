/**
 * Success Logger - Clear visual success indicators
 * Makes it EASY to see when things work! 🎉
 */

import { logger } from './logger.js';

export class SuccessLogger {
  private static successCount = 0;
  private static errorCount = 0;

  /**
   * Log successful operation with visual indicator
   */
  static success(operation: string, details?: any) {
    this.successCount++;
    logger.info(`\n${'='.repeat(60)}`);
    logger.info(`✅ SUCCESS #${this.successCount}: ${operation}`);
    if (details) {
      logger.info(`📊 Details:`, JSON.stringify(details, null, 2));
    }
    logger.info(`${'='.repeat(60)}\n`);
  }

  /**
   * Log start of operation
   */
  static start(operation: string) {
    logger.info(`\n🚀 STARTING: ${operation}...`);
  }

  /**
   * Log error with visual indicator
   */
  static error(operation: string, error: any) {
    this.errorCount++;
    logger.error(`\n${'!'.repeat(60)}`);
    logger.error(`❌ ERROR #${this.errorCount}: ${operation}`);
    logger.error(`📋 Message:`, error.message || error);
    if (error.stack) {
      logger.error(`📚 Stack:`, error.stack);
    }
    logger.error(`${'!'.repeat(60)}\n`);
  }

  /**
   * Get current stats
   */
  static getStats() {
    return {
      successes: this.successCount,
      errors: this.errorCount,
      successRate: this.successCount + this.errorCount > 0
        ? ((this.successCount / (this.successCount + this.errorCount)) * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Print summary
   */
  static printSummary() {
    const stats = this.getStats();
    logger.info(`\n${'═'.repeat(60)}`);
    logger.info(`📊 EXECUTION SUMMARY`);
    logger.info(`${'═'.repeat(60)}`);
    logger.info(`✅ Successes: ${stats.successes}`);
    logger.info(`❌ Errors: ${stats.errors}`);
    logger.info(`📈 Success Rate: ${stats.successRate}`);
    logger.info(`${'═'.repeat(60)}\n`);
  }
}
