'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'

type BlogStatus = 'pending' | 'generating' | 'completed' | 'error' | 'skipped'

type SSEEvent = {
  status: 'generating' | 'completed' | 'error' | 'timeout'
  message?: string
  blogPostId?: string
  blogTitle?: string
}

const statusConfig: Record<BlogStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: '#6b7280', bgColor: '#f3f4f6' },
  generating: { label: 'Generating...', color: '#d97706', bgColor: '#fef3c7' },
  completed: { label: 'Completed', color: '#059669', bgColor: '#d1fae5' },
  error: { label: 'Error', color: '#dc2626', bgColor: '#fee2e2' },
  skipped: { label: 'Skipped', color: '#6b7280', bgColor: '#f3f4f6' },
}

export default function BlogGenerationStatus({ path }: { path: string }) {
  const { value } = useField<BlogStatus>({ path })
  const { id } = useDocumentInfo()
  const [currentStatus, setCurrentStatus] = useState<BlogStatus>(value || 'pending')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [processingStatus, setProcessingStatus] = useState<string | null>(null)
  const hasCompletedRef = useRef(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  // Connect to SSE stream for live updates
  const connectToStream = useCallback(() => {
    if (!id || eventSourceRef.current) return

    const eventSource = new EventSource(`/api/papers/${id}/generate-blog/stream`)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data: SSEEvent = JSON.parse(event.data)

        if (data.status === 'completed') {
          setCurrentStatus('completed')
          setMessage(`Blog created: ${data.blogTitle || 'Blog post'}`)
          eventSource.close()
          eventSourceRef.current = null

          // Refresh the page after a short delay to show the updated data
          if (!hasCompletedRef.current) {
            hasCompletedRef.current = true
            setTimeout(() => window.location.reload(), 1500)
          }
        } else if (data.status === 'error') {
          setCurrentStatus('error')
          setMessage(`Error: ${data.message || 'Unknown error'}`)
          eventSource.close()
          eventSourceRef.current = null
        } else if (data.status === 'timeout') {
          setMessage(data.message || 'Status check timed out. Refresh to check status.')
          eventSource.close()
          eventSourceRef.current = null
        } else if (data.status === 'generating') {
          setMessage(data.message || 'Generating...')
        }
      } catch (e) {
        console.error('Failed to parse SSE event:', e)
      }
    }

    eventSource.onerror = () => {
      // EventSource has built-in auto-reconnection
      // This fires on each reconnection attempt
      console.log('SSE connection error, will auto-reconnect...')
    }
  }, [id])

  // Fetch paper data to get processingStatus
  const fetchPaperData = useCallback(async () => {
    if (!id) return

    try {
      const response = await fetch(`/api/papers/${id}?depth=0`)
      if (response.ok) {
        const data = await response.json()
        setCurrentStatus(data.blogGenerationStatus || 'pending')
        setProcessingStatus(data.processingStatus)

        // If already generating when component mounts, connect to stream
        if (data.blogGenerationStatus === 'generating') {
          connectToStream()
        }

        return data
      }
    } catch (error) {
      console.error('Failed to fetch paper data:', error)
    }
    return null
  }, [id, connectToStream])

  // Sync local state with field value
  useEffect(() => {
    setCurrentStatus(value || 'pending')
  }, [value])

  // Initial fetch
  useEffect(() => {
    fetchPaperData()
  }, [fetchPaperData])

  // Start blog generation
  const handleStartGeneration = async () => {
    if (!id) return

    setIsLoading(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/papers/${id}/generate-blog`, {
        method: 'POST',
      })
      const data = await response.json()

      if (response.ok) {
        setCurrentStatus('generating')
        setMessage('Generation started! Connecting to live updates...')

        // Connect to SSE stream for live updates
        connectToStream()
      } else {
        setMessage(`Error: ${data.error}`)
      }
    } catch (error) {
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
    }
  }

  const config = statusConfig[currentStatus] || statusConfig.pending
  const showSpinner = currentStatus === 'generating'
  const canStart =
    processingStatus === 'ready' && (currentStatus === 'pending' || currentStatus === 'error')

  return (
    <div className="field-type" style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
        Blog Generation Status
      </label>

      {/* Status Badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 1rem',
          borderRadius: '9999px',
          backgroundColor: config.bgColor,
          color: config.color,
          fontWeight: 500,
          fontSize: '0.875rem',
          marginBottom: '0.75rem',
        }}
      >
        {showSpinner && (
          <svg
            style={{
              width: '1rem',
              height: '1rem',
              animation: 'spin 1s linear infinite',
            }}
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="32"
              strokeDashoffset="12"
            />
          </svg>
        )}
        {currentStatus === 'completed' && (
          <svg style={{ width: '1rem', height: '1rem' }} viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {currentStatus === 'error' && (
          <svg style={{ width: '1rem', height: '1rem' }} viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {config.label}
      </div>

      {/* Action Button */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
        {canStart && (
          <button
            onClick={handleStartGeneration}
            disabled={isLoading}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              fontSize: '0.875rem',
              fontWeight: 500,
            }}
          >
            {isLoading ? 'Starting...' : 'Start Generation'}
          </button>
        )}
      </div>

      {/* Status Message */}
      {message && (
        <p
          style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: message.startsWith('Error') ? '#dc2626' : '#059669',
            padding: '0.5rem',
            backgroundColor: message.startsWith('Error') ? '#fee2e2' : '#d1fae5',
            borderRadius: '0.25rem',
          }}
        >
          {message}
        </p>
      )}

      {/* Help text */}
      {processingStatus !== 'ready' && currentStatus === 'pending' && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Wait for paper processing to complete before generating blog.
        </p>
      )}

      {currentStatus === 'generating' && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Live updates enabled. Status will update automatically.
        </p>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
