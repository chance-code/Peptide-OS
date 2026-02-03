/**
 * Native Push Notification Service
 *
 * Handles sending push notifications to iOS devices via APNs
 *
 * Required environment variables:
 * - APNS_KEY_ID: The Key ID from Apple Developer Console
 * - APNS_TEAM_ID: Your Apple Developer Team ID
 * - APNS_PRIVATE_KEY: The .p8 private key content (base64 encoded)
 * - APNS_BUNDLE_ID: Your app bundle ID (e.g., com.arcprotocol.app)
 */

import * as https from 'https'
import * as http2 from 'http2'
import * as jwt from 'jsonwebtoken'

// APNs configuration
const APNS_KEY_ID = process.env.APNS_KEY_ID
const APNS_TEAM_ID = process.env.APNS_TEAM_ID
const APNS_PRIVATE_KEY_BASE64 = process.env.APNS_PRIVATE_KEY
const APNS_BUNDLE_ID = process.env.APNS_BUNDLE_ID || 'com.arcprotocol.app'

// APNs endpoints
const APNS_HOST_PRODUCTION = 'api.push.apple.com'
const APNS_HOST_SANDBOX = 'api.sandbox.push.apple.com'

// Use sandbox in development
const APNS_HOST = process.env.NODE_ENV === 'production'
  ? APNS_HOST_PRODUCTION
  : APNS_HOST_SANDBOX

interface APNsPayload {
  aps: {
    alert: {
      title: string
      body: string
    }
    sound?: string
    badge?: number
    'content-available'?: number
  }
  data?: Record<string, unknown>
}

interface PushResult {
  success: boolean
  token: string
  error?: string
}

/**
 * Generate JWT token for APNs authentication
 */
function generateAPNsToken(): string | null {
  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY_BASE64) {
    console.error('APNs credentials not configured')
    return null
  }

  try {
    const privateKey = Buffer.from(APNS_PRIVATE_KEY_BASE64, 'base64').toString('utf-8')

    const token = jwt.sign(
      {},
      privateKey,
      {
        algorithm: 'ES256',
        keyid: APNS_KEY_ID,
        issuer: APNS_TEAM_ID,
        expiresIn: '1h',
      }
    )

    return token
  } catch (error) {
    console.error('Error generating APNs token:', error)
    return null
  }
}

/**
 * Send push notification to iOS device via APNs
 */
export async function sendAPNsNotification(
  deviceToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<PushResult> {
  const jwtToken = generateAPNsToken()

  if (!jwtToken) {
    return {
      success: false,
      token: deviceToken,
      error: 'APNs credentials not configured',
    }
  }

  const payload: APNsPayload = {
    aps: {
      alert: {
        title,
        body,
      },
      sound: 'default',
      badge: 1,
    },
    data,
  }

  return new Promise((resolve) => {
    const client = http2.connect(`https://${APNS_HOST}`)

    client.on('error', (err) => {
      console.error('APNs connection error:', err)
      resolve({
        success: false,
        token: deviceToken,
        error: err.message,
      })
    })

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': `bearer ${jwtToken}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })

    let responseData = ''

    req.on('response', (headers) => {
      const status = headers[':status']

      req.on('data', (chunk) => {
        responseData += chunk
      })

      req.on('end', () => {
        client.close()

        if (status === 200) {
          resolve({
            success: true,
            token: deviceToken,
          })
        } else {
          let errorMessage = `APNs error: ${status}`
          try {
            const errorBody = JSON.parse(responseData)
            errorMessage = errorBody.reason || errorMessage
          } catch {
            // Ignore parse error
          }
          resolve({
            success: false,
            token: deviceToken,
            error: errorMessage,
          })
        }
      })
    })

    req.on('error', (err) => {
      client.close()
      resolve({
        success: false,
        token: deviceToken,
        error: err.message,
      })
    })

    req.write(JSON.stringify(payload))
    req.end()
  })
}

/**
 * Send push notification to multiple iOS devices
 */
export async function sendAPNsNotifications(
  deviceTokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<PushResult[]> {
  const results = await Promise.all(
    deviceTokens.map((token) => sendAPNsNotification(token, title, body, data))
  )
  return results
}

/**
 * Check if APNs is configured
 */
export function isAPNsConfigured(): boolean {
  return !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_PRIVATE_KEY_BASE64)
}
