import { describe, it, expect } from 'vitest'
import OpenAI from 'openai'
import { handleOpenAIError } from '../openai'

function apiError(status: number, code: string | null, message = 'boom', type = 'x') {
  return new OpenAI.APIError(status, { code, message, type }, message, new Headers())
}

describe('handleOpenAIError', () => {
  it('flags exhausted quota as non-retryable with a billing hint', () => {
    for (const e of [apiError(429, 'insufficient_quota'), apiError(429, 'credit_balance_exhausted', 'no credits', 'insufficient_quota')]) {
      const r = handleOpenAIError(e)
      expect(r.status).toBe(429)
      expect(r.isRetryable).toBe(false)
      expect(r.message).toMatch(/credits/i)
    }
  })

  it('keeps plain rate limits retryable', () => {
    const r = handleOpenAIError(apiError(429, 'rate_limit_exceeded'))
    expect(r.isRetryable).toBe(true)
    expect(r.message).toMatch(/busy/i)
  })

  it('explains a retired model', () => {
    const r = handleOpenAIError(apiError(404, 'model_not_found'))
    expect(r.status).toBe(500)
    expect(r.message).toMatch(/model/i)
  })

  it('treats unknown errors as connection failures', () => {
    expect(handleOpenAIError(new Error('socket hang up')).status).toBe(500)
  })
})
