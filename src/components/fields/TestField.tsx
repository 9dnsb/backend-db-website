'use client'

import { useEffect } from 'react'
import { useField, useWatchForm } from '@payloadcms/ui'
import slugify from 'slugify'

export default function TestField({ path }: { path: string }) {
  const { value, setValue, showError, errorMessage } = useField<string>({ path })

  const { getDataByPath } = useWatchForm()
  const title = getDataByPath<string>('title')

  useEffect(() => {
    if (title) {
      const generated = slugify(title, { lower: true, strict: true })
      if (value !== generated) {
        setValue(generated)
      }
    }
  }, [title, value, setValue])

  return (
    <div className={`field-type text required${showError ? ' error' : ''}`}>
      <label htmlFor={path}>
        Slug<span style={{ color: 'red' }}>*</span>
      </label>
      <input
        id={path}
        name={path}
        type="text"
        value={value || ''}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Auto-generated from title"
        required
      />
      {showError && <div className="field-error">{errorMessage}</div>}
    </div>
  )
}
