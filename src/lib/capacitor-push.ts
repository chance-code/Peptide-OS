'use client'

/**
 * Capacitor Push Notifications Helper
 *
 * Handles native push notification registration on iOS/Android
 */

interface PushNotificationToken {
  value: string
}

interface PushNotificationActionPerformed {
  actionId: string
  notification: {
    data?: Record<string, unknown>
  }
}

interface PushNotification {
  title?: string
  body?: string
  data?: Record<string, unknown>
}

// Check if we're running in Capacitor
export function isCapacitor(): boolean {
  if (typeof window === 'undefined') return false
  const capacitor = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return capacitor?.isNativePlatform?.() ?? false
}

// Get the platform
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  const capacitor = (window as unknown as {
    Capacitor?: {
      isNativePlatform?: () => boolean
      getPlatform?: () => string
    }
  }).Capacitor

  if (!capacitor?.isNativePlatform?.()) return 'web'

  const platform = capacitor.getPlatform?.()
  if (platform === 'ios') return 'ios'
  if (platform === 'android') return 'android'
  return 'web'
}

// Dynamically import PushNotifications only when in Capacitor
async function getPushNotifications() {
  if (!isCapacitor()) return null

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    return PushNotifications
  } catch {
    console.log('PushNotifications plugin not available')
    return null
  }
}

/**
 * Request permission and register for native push notifications
 */
export async function registerNativePush(
  userId: string | null,
  morningTime: string,
  eveningTime: string,
  onNotificationReceived?: (notification: PushNotification) => void,
  onNotificationTapped?: (action: PushNotificationActionPerformed) => void
): Promise<{ success: boolean; token?: string; error?: string }> {
  const PushNotifications = await getPushNotifications()

  if (!PushNotifications) {
    return { success: false, error: 'Not running in Capacitor' }
  }

  try {
    // Request permission
    const permResult = await PushNotifications.requestPermissions()

    if (permResult.receive !== 'granted') {
      return { success: false, error: 'Permission denied' }
    }

    // Register with APNs/FCM
    await PushNotifications.register()

    // Wait for registration token
    return new Promise((resolve) => {
      // Set up listeners
      PushNotifications.addListener('registration', async (token: PushNotificationToken) => {
        console.log('Push registration token:', token.value)

        // Send token to server
        try {
          const res = await fetch('/api/push/device-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: token.value,
              platform: getPlatform(),
              userId,
              morningTime,
              eveningTime,
            }),
          })

          if (res.ok) {
            resolve({ success: true, token: token.value })
          } else {
            const error = await res.json()
            resolve({ success: false, error: error.error || 'Failed to register token' })
          }
        } catch (err) {
          resolve({ success: false, error: 'Failed to send token to server' })
        }
      })

      PushNotifications.addListener('registrationError', (error: { error: string }) => {
        console.error('Push registration error:', error)
        resolve({ success: false, error: error.error })
      })

      // Notification received while app is in foreground
      if (onNotificationReceived) {
        PushNotifications.addListener('pushNotificationReceived', (notification: PushNotification) => {
          console.log('Push notification received:', notification)
          onNotificationReceived(notification)
        })
      }

      // Notification tapped
      if (onNotificationTapped) {
        PushNotifications.addListener('pushNotificationActionPerformed', (action: PushNotificationActionPerformed) => {
          console.log('Push notification action:', action)
          onNotificationTapped(action)
        })
      }
    })
  } catch (error) {
    console.error('Error registering for push:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Unregister from native push notifications
 */
export async function unregisterNativePush(token: string): Promise<boolean> {
  try {
    // Remove token from server
    await fetch('/api/push/device-token', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })

    // Remove all listeners
    const PushNotifications = await getPushNotifications()
    if (PushNotifications) {
      await PushNotifications.removeAllListeners()
    }

    return true
  } catch (error) {
    console.error('Error unregistering push:', error)
    return false
  }
}

/**
 * Check if native push is available
 */
export async function isNativePushAvailable(): Promise<boolean> {
  const PushNotifications = await getPushNotifications()
  return !!PushNotifications
}

/**
 * Get current permission status
 */
export async function getNativePushPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  const PushNotifications = await getPushNotifications()

  if (!PushNotifications) {
    return 'unknown'
  }

  try {
    const result = await PushNotifications.checkPermissions()
    return result.receive as 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown'
  }
}
