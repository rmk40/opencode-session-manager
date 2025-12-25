// Responsive layout system for terminal size adaptation

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useStdout } from 'ink'

// ---------------------------------------------------------------------------
// Layout Types
// ---------------------------------------------------------------------------

export interface TerminalSize {
  width: number
  height: number
}

export interface LayoutBreakpoints {
  small: number
  medium: number
  large: number
}

export interface LayoutDimensions {
  headerHeight: number
  footerHeight: number
  sidebarWidth: number
  contentWidth: number
  contentHeight: number
  availableWidth: number
  availableHeight: number
}

export interface ResponsiveLayout {
  size: TerminalSize
  breakpoint: 'small' | 'medium' | 'large'
  dimensions: LayoutDimensions
  isCompact: boolean
  showSidebar: boolean
  maxListItems: number
  maxMessageLines: number
}

// ---------------------------------------------------------------------------
// Layout Configuration
// ---------------------------------------------------------------------------

const DEFAULT_BREAKPOINTS: LayoutBreakpoints = {
  small: 80,   // Minimum usable width
  medium: 120, // Comfortable width
  large: 160   // Wide screen
}

const MIN_DIMENSIONS = {
  width: 60,
  height: 20
}

// ---------------------------------------------------------------------------
// Layout Calculations
// ---------------------------------------------------------------------------

function calculateBreakpoint(width: number, breakpoints: LayoutBreakpoints): 'small' | 'medium' | 'large' {
  if (width < breakpoints.medium) return 'small'
  if (width < breakpoints.large) return 'medium'
  return 'large'
}

function calculateDimensions(size: TerminalSize, breakpoint: 'small' | 'medium' | 'large'): LayoutDimensions {
  const { width, height } = size
  
  // Header and footer are fixed
  const headerHeight = 3
  const footerHeight = 2
  
  // Sidebar width depends on breakpoint
  const sidebarWidth = breakpoint === 'small' ? 0 : (breakpoint === 'medium' ? 25 : 30)
  
  // Calculate available space
  const availableWidth = Math.max(0, width - sidebarWidth)
  const availableHeight = Math.max(0, height - headerHeight - footerHeight)
  
  // Content area
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
  // Ensure minimum dimensions
  const adjustedSize: TerminalSize = {
    width: Math.max(size.width, MIN_DIMENSIONS.width),
    height: Math.max(size.height, MIN_DIMENSIONS.height)
  }
  
  const breakpoint = calculateBreakpoint(adjustedSize.width, breakpoints)
  const dimensions = calculateDimensions(adjustedSize, breakpoint)
  
  // Layout flags
  const isCompact = breakpoint === 'small' || adjustedSize.height < 30
  const showSidebar = breakpoint !== 'small' && adjustedSize.width >= 100
  
  // Dynamic limits based on available space
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

// ---------------------------------------------------------------------------
// Layout Context
// ---------------------------------------------------------------------------

interface LayoutContextType {
  layout: ResponsiveLayout
  updateSize: (size: TerminalSize) => void
  // Helper functions
  getColumnWidth: (columns: number, spacing?: number) => number
  getRowHeight: (rows: number, spacing?: number) => number
  fitText: (text: string, maxWidth: number) => string
  truncateText: (text: string, maxLength: number) => string
}

const LayoutContext = createContext<LayoutContextType | null>(null)

// ---------------------------------------------------------------------------
// Layout Provider
// ---------------------------------------------------------------------------

interface LayoutProviderProps {
  children: ReactNode
  breakpoints?: LayoutBreakpoints
}

export function LayoutProvider({ children, breakpoints = DEFAULT_BREAKPOINTS }: LayoutProviderProps) {
  const { stdout } = useStdout()
  const [layout, setLayout] = useState<ResponsiveLayout>(() => 
    calculateResponsiveLayout({ width: stdout.columns || 80, height: stdout.rows || 24 }, breakpoints)
  )

  // Update layout when terminal size changes
  const updateSize = (size: TerminalSize) => {
    const newLayout = calculateResponsiveLayout(size, breakpoints)
    setLayout(newLayout)
  }

  // Listen for terminal resize events
  useEffect(() => {
    const handleResize = () => {
      updateSize({ width: stdout.columns || 80, height: stdout.rows || 24 })
    }

    // Set up resize listener
    process.stdout.on('resize', handleResize)
    
    // Initial size update
    handleResize()

    return () => {
      process.stdout.off('resize', handleResize)
    }
  }, [stdout])

  // Helper functions
  const getColumnWidth = (columns: number, spacing: number = 1): number => {
    const totalSpacing = (columns - 1) * spacing
    return Math.floor((layout.dimensions.contentWidth - totalSpacing) / columns)
  }

  const getRowHeight = (rows: number, spacing: number = 0): number => {
    const totalSpacing = (rows - 1) * spacing
    return Math.floor((layout.dimensions.contentHeight - totalSpacing) / rows)
  }

  const fitText = (text: string, maxWidth: number): string => {
    if (text.length <= maxWidth) return text
    
    // Try to break at word boundaries
    const words = text.split(' ')
    let result = ''
    
    for (const word of words) {
      const testResult = result ? `${result} ${word}` : word
      if (testResult.length <= maxWidth) {
        result = testResult
      } else {
        break
      }
    }
    
    return result || text.slice(0, maxWidth)
  }

  const truncateText = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text
    
    if (maxLength <= 3) return text.slice(0, maxLength)
    
    return text.slice(0, maxLength - 3) + '...'
  }

  const contextValue: LayoutContextType = {
    layout,
    updateSize,
    getColumnWidth,
    getRowHeight,
    fitText,
    truncateText
  }

  return (
    <LayoutContext.Provider value={contextValue}>
      {children}
    </LayoutContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook for using layout
// ---------------------------------------------------------------------------

export function useLayout(): LayoutContextType {
  const context = useContext(LayoutContext)
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider')
  }
  return context
}

// ---------------------------------------------------------------------------
// Layout utility hooks
// ---------------------------------------------------------------------------

export function useResponsiveColumns(): number {
  const { layout } = useLayout()
  
  switch (layout.breakpoint) {
    case 'small': return 1
    case 'medium': return 2
    case 'large': return 3
    default: return 1
  }
}

export function useCompactMode(): boolean {
  const { layout } = useLayout()
  return layout.isCompact
}

export function useSidebarVisible(): boolean {
  const { layout } = useLayout()
  return layout.showSidebar
}

export function useMaxItems(): number {
  const { layout } = useLayout()
  return layout.maxListItems
}

export function useContentDimensions(): { width: number; height: number } {
  const { layout } = useLayout()
  return {
    width: layout.dimensions.contentWidth,
    height: layout.dimensions.contentHeight
  }
}

// ---------------------------------------------------------------------------
// Layout Components
// ---------------------------------------------------------------------------

interface BoxProps {
  width?: number | string
  height?: number | string
  padding?: number
  margin?: number
  children: ReactNode
}

export function Box({ width, height, padding = 0, margin = 0, children }: BoxProps) {
  const { layout } = useLayout()
  
  // Calculate actual dimensions
  const actualWidth = typeof width === 'number' 
    ? width 
    : typeof width === 'string' && width.endsWith('%')
    ? Math.floor(layout.dimensions.contentWidth * (parseInt(width) / 100))
    : layout.dimensions.contentWidth
    
  const actualHeight = typeof height === 'number'
    ? height
    : typeof height === 'string' && height.endsWith('%')
    ? Math.floor(layout.dimensions.contentHeight * (parseInt(height) / 100))
    : undefined

  // Apply padding and margin
  const contentWidth = Math.max(0, actualWidth - (padding * 2) - (margin * 2))
  const contentHeight = actualHeight ? Math.max(0, actualHeight - (padding * 2) - (margin * 2)) : undefined

  return (
    <div style={{ 
      width: actualWidth, 
      height: actualHeight,
      padding,
      margin,
      overflow: 'hidden'
    }}>
      <div style={{ 
        width: contentWidth, 
        height: contentHeight,
        overflow: 'hidden'
      }}>
        {children}
      </div>
    </div>
  )
}

interface FlexProps {
  direction?: 'row' | 'column'
  gap?: number
  children: ReactNode
}

export function Flex({ direction = 'row', gap = 0, children }: FlexProps) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: direction,
      gap: gap > 0 ? `${gap}ch` : undefined
    }}>
      {children}
    </div>
  )
}

interface GridProps {
  columns?: number
  rows?: number
  gap?: number
  children: ReactNode
}

export function Grid({ columns, rows, gap = 1, children }: GridProps) {
  const { getColumnWidth, getRowHeight } = useLayout()
  
  const columnWidth = columns ? getColumnWidth(columns, gap) : undefined
  const rowHeight = rows ? getRowHeight(rows, gap) : undefined
  
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: columns ? `repeat(${columns}, ${columnWidth}ch)` : undefined,
      gridTemplateRows: rows ? `repeat(${rows}, ${rowHeight}em)` : undefined,
      gap: gap > 0 ? `${gap}ch` : undefined
    }}>
      {children}
    </div>
  )
}