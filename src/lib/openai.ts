import OpenAI from 'openai'

// Lazy initialize with timeout configuration
let openai: OpenAI | null = null

export function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 15000, // 15 second timeout
      maxRetries: 2,  // Retry up to 2 times on transient errors
    })
  }
  return openai
}

// Helper to handle OpenAI errors with graceful fallbacks
export function handleOpenAIError(error: unknown): {
  message: string
  status: number
  isRetryable: boolean
} {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return {
        message: 'AI service is busy. Please try again in a moment.',
        status: 429,
        isRetryable: true,
      }
    }
    if (error.status === 503 || error.status === 502) {
      return {
        message: 'AI service is temporarily unavailable. Please try again.',
        status: 503,
        isRetryable: true,
      }
    }
    if (error.status === 401) {
      console.error('OpenAI API key invalid or missing')
      return {
        message: 'AI service configuration error.',
        status: 500,
        isRetryable: false,
      }
    }
    return {
      message: 'AI service error. Please try again.',
      status: error.status || 500,
      isRetryable: error.status >= 500,
    }
  }

  // Timeout error
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      message: 'AI request timed out. Please try again.',
      status: 504,
      isRetryable: true,
    }
  }

  // Network or unknown error
  return {
    message: 'Failed to connect to AI service.',
    status: 500,
    isRetryable: true,
  }
}
