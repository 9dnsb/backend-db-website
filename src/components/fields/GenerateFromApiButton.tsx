'use client'

import React, { useState } from 'react'
import { useForm, useFormFields } from '@payloadcms/ui'

const GenerateFromApiButton: React.FC = () => {
  const { getData, dispatchFields } = useForm()
  const startingWordField = useFormFields(([fields]) => fields?.startingWord)
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    const startingWord = startingWordField?.value

    if (!startingWord || typeof startingWord !== 'string') {
      alert('Please enter a starting word first.')
      return
    }

    setLoading(true)

    const res = await fetch('/api/generate-oneoffs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ startingWord }),
    })

    const json = await res.json()

    if (Array.isArray(json.words)) {
      const existingAnswers = getData()?.validAnswers || []

      // Remove all existing answers
      for (let i = existingAnswers.length - 1; i >= 0; i--) {
        dispatchFields({
          type: 'REMOVE_ROW',
          path: 'validAnswers',
          rowIndex: i,
        })
      }

      // Add new rows using subFieldState
      json.words.forEach((word: string) => {
        dispatchFields({
          type: 'ADD_ROW',
          path: 'validAnswers',
          subFieldState: {
            word: { value: word },
          },
        })
      })
    } else {
      alert('No valid one-off words found.')
    }

    setLoading(false)
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      <button type="button" className="btn btn-primary" disabled={loading} onClick={handleClick}>
        {loading ? 'Generating...' : '🔍 Generate Valid Answers'}
      </button>
    </div>
  )
}

export default GenerateFromApiButton
