'use client'

import { useEffect, useState, useCallback } from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'

type Status = 'pending' | 'processing' | 'ready' | 'error'

const statusConfig: Record<Status, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: '#6b7280', bgColor: '#f3f4f6' },
  processing: { label: 'Processing...', color: '#d97706', bgColor: '#fef3c7' },
  ready: { label: 'Ready', color: '#059669', bgColor: '#d1fae5' },
  error: { label: 'Error', color: '#dc2626', bgColor: '#fee2e2' },
}

export default function ProcessingStatus({ path }: { path: string }) {
  const { value } = useField<Status>({ path })
  const { id } = useDocumentInfo()
  const [currentStatus, setCurrentStatus] = useState<Status>(value || 'pending')
  const [isPolling, setIsPolling] = useState(false)

  const fetchStatus = useCallback(async () => {
    if (!id) return

    try {
      const response = await fetch(`/api/papers/${id}?depth=0`)
      if (response.ok) {
        const data = await response.json()
        const newStatus = data.processingStatus as Status
        setCurrentStatus(newStatus)

        // If status changed to ready or error, stop polling and refresh the page
        if (newStatus === 'ready' || newStatus === 'error') {
          setIsPolling(false)
          // Refresh the page to show updated data
          window.location.reload()
        }
      }
    } catch (error) {
      console.error('Failed to fetch status:', error)
    }
  }, [id])

  // Start polling when status is pending or processing
  useEffect(() => {
    if (value === 'pending' || value === 'processing') {
      setIsPolling(true)
    }
    setCurrentStatus(value || 'pending')
  }, [value])

  // Poll every 3 seconds while processing
  useEffect(() => {
    if (!isPolling || !id) return

    const interval = setInterval(fetchStatus, 3000)
    return () => clearInterval(interval)
  }, [isPolling, id, fetchStatus])

  const config = statusConfig[currentStatus] || statusConfig.pending
  const showSpinner = currentStatus === 'pending' || currentStatus === 'processing'

  return (
    <div className="field-type" style={{ marginBottom: '1.5rem' }}>
      <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 500 }}>
        OpenAI Processing Status
      </label>
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
        {currentStatus === 'ready' && (
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
      {showSpinner && (
        <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#6b7280' }}>
          Auto-refreshing every 3 seconds...
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
