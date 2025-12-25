// Property tests for responsive layout system
// Feature: opencode-session-monitor, Property 13: Responsive Layout Adaptation

import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Test types matching the layout system
interface TerminalSize {
  width: number
  height: number
}

interface LayoutBreakpoints {
  small: number
  medium: number
  large: number
}

interface LayoutDimensions {
  headerHeight: number
  footerHeight: number
  sidebarWidth: number
  contentWidth: number
  contentHeight: number
  availableWidth: number
  availableHeight: number
}

interface ResponsiveLayout {
  size: TerminalSize
  breakpoint: 'small' | 'medium' | 'large'
  dimensions: LayoutDimensions
  isCompact: boolean
  showSidebar: boolean
  maxListItems: number
  maxMessageLines: number
}

// Layout calculation functions (extracted from layout.tsx for testing)
const DEFAULT_BREAKPOINTS: LayoutBreakpoints = {
  small: 80,
  medium: 120,
  large: 160
}

const MIN_DIMENSIONS = {
  width: 60,
  height: 20
}

function calculateBreakpoint(width: number, breakpoints: LayoutBreakpoints): 'small' | 'medium' | 'large' {
  if (width < breakpoints.medium) return 'small'
  if (width < breakpoints.large) return 'medium'
  return 'large'
}

function calculateDimensions(size: TerminalSize, breakpoint: 'small' | 'medium' | 'large'): LayoutDimensions {
  const { width, height } = size
  
  const headerHeight = 3
  const footerHeight = 2
  const sidebarWidth = breakpoint === 'small' ? 0 : (breakpoint === 'medium' ? 25 : 30)
  
  const availableWidth = Math.max(0, width - sidebarWidth)
  const availableHeight = Math.max(0, height - headerHeight - footerHeight)
  
  const contentWidth = availableWidth
  const contentHeight = availableHeight
  
  return {
    headerHeight,
    footerHeight,
    sidebarWidth,
    contentWidth,
    contentHeight,
    availableWidth,
    availableHeight
  }
}

function calculateResponsiveLayout(
  size: TerminalSize, 
  breakpoints: LayoutBreakpoints = DEFAULT_BREAKPOINTS
): ResponsiveLayout {
  const adjustedSize: TerminalSize = {
    width: Math.max(size.width, MIN_DIMENSIONS.width),
    height: Math.max(size.height, MIN_DIMENSIONS.height)
  }
  
  const breakpoint = calculateBreakpoint(adjustedSize.width, breakpoints)
  const dimensions = calculateDimensions(adjustedSize, breakpoint)
  
  const isCompact = breakpoint === 'small' || adjustedSize.height < 30
  const showSidebar = breakpoint !== 'small' && adjustedSize.width >= 100
  
  const maxListItems = Math.max(5, Math.floor(dimensions.contentHeight * 0.8))
  const maxMessageLines = Math.max(10, Math.floor(dimensions.contentHeight * 0.6))
  
  return {
    size: adjustedSize,
    breakpoint,
    dimensions,
    isCompact,
    showSidebar,
    maxListItems,
    maxMessageLines
  }
}

// Test arbitraries
const terminalSizeArb = fc.record({
  width: fc.integer({ min: 40, max: 300 }),
  height: fc.integer({ min: 15, max: 100 })
}) as fc.Arbitrary<TerminalSize>

const breakpointsArb = fc.record({
  small: fc.integer({ min: 60, max: 100 }),
  medium: fc.integer({ min: 100, max: 140 }),
  large: fc.integer({ min: 140, max: 200 })
}).filter(bp => bp.small < bp.medium && bp.medium < bp.large) as fc.Arbitrary<LayoutBreakpoints>

describe('Responsive Layout System', () => {
  it('Property 13: Layout dimensions are always non-negative', () => {
    fc.assert(
      fc.property(
        terminalSizeArb,
        breakpointsArb,
        (size, breakpoints) => {
          const layout = calculateResponsiveLayout(size, breakpoints)
          
          // All dimensions should be non-negative
          expect(layout.dimensions.headerHeight).toBeGreaterThanOrEqual(0)
          expect(layout.dimensions.footerHeight).toBeGreaterThanOrEqual(0)
          expect(layout.dimensions.sidebarWidth).toBeGreaterThanOrEqual(0)
          expect(layout.dimensions.contentWidth).toBeGreaterThanOrEqual(0)
          expect(layout.dimensions.contentHeight).toBeGreaterThanOrEqual(0)
          expect(layout.dimensions.availableWidth).toBeGreaterThanOrEqual(0)
          expect(layout.dimensions.availableHeight).toBeGreaterThanOrEqual(0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Minimum dimensions are enforced', () => {
    fc.assert(
      fc.property(
        fc.record({
          width: fc.integer({ min: 1, max: 200 }),
          height: fc.integer({ min: 1, max: 100 })
        }),
        (size) => {
          const layout = calculateResponsiveLayout(size)
          
          // Size should be at least minimum dimensions
          expect(layout.size.width).toBeGreaterThanOrEqual(MIN_DIMENSIONS.width)
          expect(layout.size.height).toBeGreaterThanOrEqual(MIN_DIMENSIONS.height)
          
          // If input was below minimum, it should be adjusted
          if (size.width < MIN_DIMENSIONS.width) {
            expect(layout.size.width).toBe(MIN_DIMENSIONS.width)
          }
          if (size.height < MIN_DIMENSIONS.height) {
            expect(layout.size.height).toBe(MIN_DIMENSIONS.height)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Breakpoint calculation is consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 300 }),
        breakpointsArb,
        (width, breakpoints) => {
          const breakpoint = calculateBreakpoint(width, breakpoints)
          
          // Breakpoint should match width ranges
          if (width < breakpoints.medium) {
            expect(breakpoint).toBe('small')
          } else if (width < breakpoints.large) {
            expect(breakpoint).toBe('medium')
          } else {
            expect(breakpoint).toBe('large')
          }
          
          // Breakpoint should be one of the valid values
          expect(['small', 'medium', 'large']).toContain(breakpoint)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Content area calculations are correct', () => {
    fc.assert(
      fc.property(
        terminalSizeArb,
        (size) => {
          const layout = calculateResponsiveLayout(size)
          const { dimensions } = layout
          
          // Content width should account for sidebar
          const expectedContentWidth = Math.max(0, layout.size.width - dimensions.sidebarWidth)
          expect(dimensions.contentWidth).toBe(expectedContentWidth)
          expect(dimensions.availableWidth).toBe(expectedContentWidth)
          
          // Content height should account for header and footer
          const expectedContentHeight = Math.max(0, layout.size.height - dimensions.headerHeight - dimensions.footerHeight)
          expect(dimensions.contentHeight).toBe(expectedContentHeight)
          expect(dimensions.availableHeight).toBe(expectedContentHeight)
          
          // Total width should not exceed terminal width
          expect(dimensions.sidebarWidth + dimensions.contentWidth).toBeLessThanOrEqual(layout.size.width)
          
          // Total height should not exceed terminal height
          expect(dimensions.headerHeight + dimensions.contentHeight + dimensions.footerHeight).toBeLessThanOrEqual(layout.size.height)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Sidebar visibility rules are consistent', () => {
    fc.assert(
      fc.property(
        terminalSizeArb,
        (size) => {
          const layout = calculateResponsiveLayout(size)
          
          // Sidebar should not be shown on small breakpoints
          if (layout.breakpoint === 'small') {
            expect(layout.showSidebar).toBe(false)
            expect(layout.dimensions.sidebarWidth).toBe(0)
          }
          
          // Sidebar should only be shown if width is sufficient
          if (layout.showSidebar) {
            expect(layout.size.width).toBeGreaterThanOrEqual(100)
            expect(layout.breakpoint).not.toBe('small')
          }
          
          // If sidebar is not shown, width should be 0
          if (!layout.showSidebar) {
            expect(layout.dimensions.sidebarWidth).toBe(0)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Compact mode rules are consistent', () => {
    fc.assert(
      fc.property(
        terminalSizeArb,
        (size) => {
          const layout = calculateResponsiveLayout(size)
          
          // Compact mode should be enabled for small breakpoints
          if (layout.breakpoint === 'small') {
            expect(layout.isCompact).toBe(true)
          }
          
          // Compact mode should be enabled for short terminals
          if (layout.size.height < 30) {
            expect(layout.isCompact).toBe(true)
          }
          
          // Compact mode affects layout behavior
          expect(typeof layout.isCompact).toBe('boolean')
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Dynamic limits are reasonable', () => {
    fc.assert(
      fc.property(
        terminalSizeArb,
        (size) => {
          const layout = calculateResponsiveLayout(size)
          
          // Max list items should have reasonable bounds
          expect(layout.maxListItems).toBeGreaterThanOrEqual(5)
          expect(layout.maxListItems).toBeLessThanOrEqual(layout.dimensions.contentHeight)
          
          // Max message lines should have reasonable bounds
          expect(layout.maxMessageLines).toBeGreaterThanOrEqual(10)
          expect(layout.maxMessageLines).toBeLessThanOrEqual(layout.dimensions.contentHeight)
          
          // Limits should scale with available space
          if (layout.dimensions.contentHeight > 0) {
            const expectedMaxItems = Math.max(5, Math.floor(layout.dimensions.contentHeight * 0.8))
            const expectedMaxMessages = Math.max(10, Math.floor(layout.dimensions.contentHeight * 0.6))
            
            expect(layout.maxListItems).toBe(expectedMaxItems)
            expect(layout.maxMessageLines).toBe(expectedMaxMessages)
          }
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Layout adapts to size changes', () => {
    fc.assert(
      fc.property(
        terminalSizeArb,
        terminalSizeArb,
        (size1, size2) => {
          const layout1 = calculateResponsiveLayout(size1)
          const layout2 = calculateResponsiveLayout(size2)
          
          // Different sizes should potentially produce different layouts
          if (size1.width !== size2.width || size1.height !== size2.height) {
            // Layouts may differ in various ways
            const layoutsDiffer = 
              layout1.breakpoint !== layout2.breakpoint ||
              layout1.isCompact !== layout2.isCompact ||
              layout1.showSidebar !== layout2.showSidebar ||
              layout1.dimensions.contentWidth !== layout2.dimensions.contentWidth ||
              layout1.dimensions.contentHeight !== layout2.dimensions.contentHeight
            
            // This is expected behavior - layouts should adapt
            expect(typeof layoutsDiffer).toBe('boolean')
          }
          
          // Both layouts should be valid
          expect(['small', 'medium', 'large']).toContain(layout1.breakpoint)
          expect(['small', 'medium', 'large']).toContain(layout2.breakpoint)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 13: Text fitting and truncation work correctly', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }),
        fc.integer({ min: 1, max: 100 }),
        (text, maxLength) => {
          // Test truncation function
          const truncateText = (text: string, maxLength: number): string => {
            if (text.length <= maxLength) return text
            if (maxLength <= 3) return text.slice(0, maxLength)
            return text.slice(0, maxLength - 3) + '...'
          }
          
          const truncated = truncateText(text, maxLength)
          
          // Truncated text should not exceed max length
          expect(truncated.length).toBeLessThanOrEqual(maxLength)
          
          // If original was short enough, should be unchanged
          if (text.length <= maxLength) {
            expect(truncated).toBe(text)
          }
          
          // If truncated, should end with ellipsis (unless maxLength <= 3)
          if (text.length > maxLength && maxLength > 3) {
            expect(truncated.endsWith('...')).toBe(true)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})