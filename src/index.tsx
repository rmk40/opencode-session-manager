#!/usr/bin/env node

// Main entry point for OpenCode Session Monitor

import { runCLI } from './cli'

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

// Run CLI
runCLI().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})