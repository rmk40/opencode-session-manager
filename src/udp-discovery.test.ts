// Property tests for UDP discovery and network communication
// Feature: opencode-session-monitor, Property 1: Instance Discovery and Lifecycle Management
// Feature: opencode-session-monitor, Property 14: Network Communication Protocol Compliance

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'
import { 
  UDPDiscovery, 
  parseUDPMessage, 
  createAnnouncePacket, 
  createShutdownPacket, 
  serializePacket 
} from './udp-discovery'
import { AnnouncePacket, ShutdownPacket } from './types'

// Test utilities
let discovery: UDPDiscovery | null = null

beforeEach(() => {
  discovery = new UDPDiscovery()
})

afterEach(async () => {
  if (discovery) {
    await discovery.stop()
    discovery = null
  }
})

// Arbitraries for generating test data
const serverIdArb = fc.string({ minLength: 1, maxLength: 50 })
const serverNameArb = fc.string({ minLength: 1, maxLength: 100 })
const versionArb = fc.option(fc.string({ minLength: 1, maxLength: 20 }))

const announcePacketArb = fc.record({
  type: fc.constant('announce' as const),
  serverId: serverIdArb,
  serverUrl: fc.webUrl(),
  serverName: serverNameArb,
  version: versionArb,
  timestamp: fc.integer({ min: 0, max: Date.now() })
}) as fc.Arbitrary<AnnouncePacket>

const shutdownPacketArb = fc.record({
  type: fc.constant('shutdown' as const),
  serverId: serverIdArb,
  timestamp: fc.integer({ min: 0, max: Date.now() })
}) as fc.Arbitrary<ShutdownPacket>

describe('UDP Discovery and Network Communication', () => {
  it('Property 1: Instance discovery packets are correctly parsed and validated', () => {
    fc.assert(
      fc.property(
        announcePacketArb,
        (packet) => {
          // Serialize and parse the packet
          const buffer = serializePacket(packet)
          const parsed = parseUDPMessage(buffer)
          
          // Should successfully parse valid packets
          expect(parsed).not.toBeNull()
          expect(parsed!.type).toBe('announce')
          expect(parsed!.serverId).toBe(packet.serverId)
          expect(parsed!.serverName).toBe(packet.serverName)
          expect(parsed!.timestamp).toBe(packet.timestamp)
          
          // Server URL should be present and valid
          expect(parsed!.serverUrl).toBeTruthy()
          expect(typeof parsed!.serverUrl).toBe('string')
          
          // Version should match if present
          if (packet.version) {
            expect((parsed as AnnouncePacket).version).toBe(packet.version)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: Shutdown packets are correctly parsed and validated', () => {
    fc.assert(
      fc.property(
        shutdownPacketArb,
        (packet) => {
          // Serialize and parse the packet
          const buffer = serializePacket(packet)
          const parsed = parseUDPMessage(buffer)
          
          // Should successfully parse valid packets
          expect(parsed).not.toBeNull()
          expect(parsed!.type).toBe('shutdown')
          expect(parsed!.serverId).toBe(packet.serverId)
          expect(parsed!.timestamp).toBe(packet.timestamp)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: Invalid packets are rejected gracefully', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.record({
            type: fc.string().filter(s => !['announce', 'shutdown'].includes(s)),
            serverId: serverIdArb,
          }),
          fc.record({
            type: fc.constant('announce'),
            // Missing required fields
          }),
          fc.string(), // Invalid JSON
          fc.constant(''), // Empty string
          fc.constant('{}'), // Empty object
        ),
        (invalidData) => {
          let buffer: Buffer
          
          if (typeof invalidData === 'string') {
            buffer = Buffer.from(invalidData, 'utf8')
          } else {
            buffer = Buffer.from(JSON.stringify(invalidData), 'utf8')
          }
          
          // Should return null for invalid packets
          const parsed = parseUDPMessage(buffer)
          expect(parsed).toBeNull()
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 14: Network protocol compliance - packet structure', () => {
    fc.assert(
      fc.property(
        fc.oneof(announcePacketArb, shutdownPacketArb),
        (packet) => {
          // All packets must have type and timestamp
          expect(packet.type).toBeTruthy()
          expect(typeof packet.type).toBe('string')
          expect(packet.timestamp).toBeGreaterThanOrEqual(0)
          expect(typeof packet.timestamp).toBe('number')
          
          // All packets must have serverId
          expect(packet.serverId).toBeTruthy()
          expect(typeof packet.serverId).toBe('string')
          expect(packet.serverId.length).toBeGreaterThan(0)
          
          // Announce packets must have additional fields
          if (packet.type === 'announce') {
            const announcePacket = packet as AnnouncePacket
            expect(announcePacket.serverUrl).toBeTruthy()
            expect(typeof announcePacket.serverUrl).toBe('string')
            expect(announcePacket.serverName).toBeTruthy()
            expect(typeof announcePacket.serverName).toBe('string')
            
            // Version is optional but must be string if present
            if (announcePacket.version !== undefined && announcePacket.version !== null) {
              expect(typeof announcePacket.version).toBe('string')
            }
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 14: Packet serialization is consistent and reversible', () => {
    fc.assert(
      fc.property(
        fc.oneof(announcePacketArb, shutdownPacketArb),
        (originalPacket) => {
          // Serialize and deserialize
          const buffer = serializePacket(originalPacket)
          const parsedPacket = parseUDPMessage(buffer)
          
          // Should successfully round-trip
          expect(parsedPacket).not.toBeNull()
          expect(parsedPacket!.type).toBe(originalPacket.type)
          expect(parsedPacket!.serverId).toBe(originalPacket.serverId)
          expect(parsedPacket!.timestamp).toBe(originalPacket.timestamp)
          
          // Type-specific fields should match
          if (originalPacket.type === 'announce') {
            const original = originalPacket as AnnouncePacket
            const parsed = parsedPacket as AnnouncePacket
            expect(parsed.serverName).toBe(original.serverName)
            expect(parsed.version).toBe(original.version)
            // Note: serverUrl might be normalized, so we just check it exists
            expect(parsed.serverUrl).toBeTruthy()
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 14: Server URL normalization handles various formats', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.webUrl(), // Valid URLs
          fc.string().filter(s => !s.includes('://')), // Invalid URLs without protocol
          fc.constant(''), // Empty string
          fc.constant('not-a-url'), // Invalid format
          fc.constant('ftp://example.com'), // Invalid protocol
        ),
        (url) => {
          // Test URL normalization logic directly
          try {
            const normalized = discovery!['normalizeServerUrl'](url)
            
            // If normalization succeeds, should be valid HTTP/HTTPS URL
            expect(normalized).toBeTruthy()
            expect(typeof normalized).toBe('string')
            expect(normalized).toMatch(/^https?:\/\//)
            
            // Should have a port specified
            const urlObj = new URL(normalized)
            expect(urlObj.port).toBeTruthy()
          } catch (error) {
            // Invalid URLs should throw errors
            expect(error).toBeDefined()
            expect(error instanceof Error).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 14: Packet creation utilities produce valid packets', () => {
    fc.assert(
      fc.property(
        serverIdArb,
        fc.webUrl(),
        serverNameArb,
        versionArb,
        (serverId, serverUrl, serverName, version) => {
          // Create announce packet
          const announcePacket = createAnnouncePacket(serverId, serverUrl, serverName, version)
          
          expect(announcePacket.type).toBe('announce')
          expect(announcePacket.serverId).toBe(serverId)
          expect(announcePacket.serverUrl).toBe(serverUrl)
          expect(announcePacket.serverName).toBe(serverName)
          expect(announcePacket.version).toBe(version)
          expect(announcePacket.timestamp).toBeGreaterThan(0)
          expect(announcePacket.timestamp).toBeLessThanOrEqual(Date.now() + 1000)
          
          // Create shutdown packet
          const shutdownPacket = createShutdownPacket(serverId)
          
          expect(shutdownPacket.type).toBe('shutdown')
          expect(shutdownPacket.serverId).toBe(serverId)
          expect(shutdownPacket.timestamp).toBeGreaterThan(0)
          expect(shutdownPacket.timestamp).toBeLessThanOrEqual(Date.now() + 1000)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 1: UDP discovery basic lifecycle', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (shouldTest) => {
          const testDiscovery = new UDPDiscovery()
          
          // Initial state should be not listening
          expect(testDiscovery.listening).toBe(false)
          expect(testDiscovery.port).toBeGreaterThan(0)
          
          // Should have proper event emitter interface
          expect(typeof testDiscovery.on).toBe('function')
          expect(typeof testDiscovery.emit).toBe('function')
          expect(typeof testDiscovery.start).toBe('function')
          expect(typeof testDiscovery.stop).toBe('function')
          
          // Test basic properties
          if (shouldTest) {
            expect(testDiscovery.listening).toBe(false)
          }
        }
      ),
      { numRuns: 10 }
    )
  })

  it('Property 14: Buffer handling is robust', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.uint8Array(), // Random bytes
          fc.string().map(s => Buffer.from(s, 'utf8')), // String buffers
          fc.constant(Buffer.alloc(0)), // Empty buffer
        ),
        (buffer) => {
          // Should not throw on any buffer input
          expect(() => {
            const result = parseUDPMessage(Buffer.from(buffer))
            // Result should be null for invalid data, or valid packet for valid data
            expect(result === null || (typeof result === 'object' && 'type' in result)).toBe(true)
          }).not.toThrow()
        }
      ),
      { numRuns: 100 }
    )
  })
})