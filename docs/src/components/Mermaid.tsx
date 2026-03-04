'use client'

import mermaid from 'mermaid'
import { useTheme } from 'next-themes'
import { useEffect, useRef } from 'react'

interface MermaidProps {
  chart: string
  className?: string
}

export function Mermaid({ chart, className = '' }: MermaidProps) {
  const theme = useTheme()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      // Initialize mermaid with configuration
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        themeVariables: {
          primaryColor: '#3b82f6',
          primaryTextColor: '#374151',
          primaryBorderColor: '#d1d5db',
          lineColor: '#6b7280',
          sectionBkgColor: '#f9fafb',
          altSectionBkgColor: '#ffffff',
          gridColor: '#e5e7eb',
          tertiaryColor: '#f3f4f6',
        },
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        fontSize: 14,
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
        },
        sequence: {
          useMaxWidth: true,
          diagramMarginX: 10,
          diagramMarginY: 10,
          actorMargin: 50,
          width: 150,
          height: 65,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35,
        },
        gantt: {
          useMaxWidth: true,
          leftPadding: 75,
          rightPadding: 20,
          topPadding: 50,
        },
      })

      // Generate unique ID for the diagram
      const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`

      // Clear previous content
      ref.current.innerHTML = ''

      // Render the diagram
      mermaid
        .render(id, chart)
        .then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg
          }
        })
        .catch((error) => {
          console.error('Mermaid rendering error:', error)
          if (ref.current) {
            ref.current.innerHTML = `<div class="text-red-500 p-4 border border-red-200 rounded">
            <h4 class="font-bold">Mermaid 渲染错误</h4>
            <pre class="mt-2 text-sm overflow-x-auto">${error.message}</pre>
          </div>`
          }
        })
    }
  }, [chart, theme])

  return (
    <div
      ref={ref}
      className={`my-6 flex justify-center overflow-x-auto ${className}`}
      style={{
        minHeight: '100px',
        // Support dark mode
        filter: 'var(--tw-brightness, brightness(1))',
      }}
    />
  )
}

// Dark mode support
export function MermaidDark({ chart, className = '' }: MermaidProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        themeVariables: {
          primaryColor: '#60a5fa',
          primaryTextColor: '#f3f4f6',
          primaryBorderColor: '#4b5563',
          lineColor: '#9ca3af',
          sectionBkgColor: '#1f2937',
          altSectionBkgColor: '#111827',
          gridColor: '#374151',
          tertiaryColor: '#1f2937',
        },
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        fontSize: 14,
        flowchart: {
          useMaxWidth: true,
          htmlLabels: true,
          curve: 'basis',
        },
      })

      const id = `mermaid-dark-${Math.random().toString(36).substr(2, 9)}`
      ref.current.innerHTML = ''

      mermaid
        .render(id, chart)
        .then(({ svg }) => {
          if (ref.current) {
            ref.current.innerHTML = svg
          }
        })
        .catch((error) => {
          console.error('Mermaid rendering error:', error)
          if (ref.current) {
            ref.current.innerHTML = `<div class="text-red-400 p-4 border border-red-600 rounded">
            <h4 class="font-bold">Mermaid 渲染错误</h4>
            <pre class="mt-2 text-sm overflow-x-auto">${error.message}</pre>
          </div>`
          }
        })
    }
  }, [chart])

  return (
    <div
      ref={ref}
      className={`my-6 flex justify-center overflow-x-auto ${className}`}
      style={{ minHeight: '100px' }}
    />
  )
}
