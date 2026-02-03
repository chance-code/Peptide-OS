'use client'

import { useEffect, useState, useRef } from 'react'
import { Bell, BellOff, Check, Smartphone } from 'lucide-react'
import { useAppStore } from '@/store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  isCapacitor,
  registerNativePush,
  unregisterNativePush,
  isNativePushAvailable,
} from '@/lib/capacitor-push'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function NotificationSettings() {
  const { currentUserId } = useAppStore()
  const [isSupported, setIsSupported] = useState(false)
  const [isNative, setIsNative] = useState(false)
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [permission, setPermission] = useState<NotificationPermission | 'unknown'>('default')
  const [morningTime, setMorningTime] = useState('08:00')
  const [eveningTime, setEveningTime] = useState('20:00')
  const [testSent, setTestSent] = useState(false)
  const deviceTokenRef = useRef<string | null>(null)

  useEffect(() => {
    checkSupport()
  }, [])

  async function checkSupport() {
    // Check if we're in native app
    const native = isCapacitor()
    setIsNative(native)

    if (native) {
      // Check native push support
      const nativeAvailable = await isNativePushAvailable()
      setIsSupported(nativeAvailable)

      // For native, we check if we have a stored token
      // The actual permission check happens when enabling
      const storedToken = localStorage.getItem('device_push_token')
      if (storedToken) {
        deviceTokenRef.current = storedToken
        setIsSubscribed(true)
      }
    } else {
      // Web push support check
      const supported =
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window

      setIsSupported(supported)

      if (supported) {
        setPermission(Notification.permission)

        // Check if already subscribed (only if service worker is already registered)
        try {
          const registration = await navigator.serviceWorker.getRegistration('/sw.js')
          if (registration) {
            const subscription = await registration.pushManager.getSubscription()
            setIsSubscribed(!!subscription)
          }
        } catch (error) {
          console.log('No existing service worker registration')
        }
      }
    }

    setIsLoading(false)
  }

  async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')
        console.log('Service Worker registered:', registration)
        return registration
      } catch (error) {
        console.error('Service Worker registration failed:', error)
        throw error
      }
    }
    throw new Error('Service Worker not supported')
  }

  async function subscribe() {
    setIsLoading(true)

    try {
      if (isNative) {
        // Native push registration
        const result = await registerNativePush(
          currentUserId,
          morningTime,
          eveningTime,
          // On notification received while app is open
          (notification) => {
            console.log('Notification received:', notification)
          },
          // On notification tapped
          (action) => {
            console.log('Notification tapped:', action)
            // Navigate to the URL in the notification data
            const url = action.notification.data?.url as string
            if (url && typeof window !== 'undefined') {
              window.location.href = url
            }
          }
        )

        if (result.success && result.token) {
          localStorage.setItem('device_push_token', result.token)
          deviceTokenRef.current = result.token
          setIsSubscribed(true)
        } else {
          alert(result.error || 'Failed to enable notifications')
        }
      } else {
        // Web push registration
        // Fetch VAPID public key from server
        const keyResponse = await fetch('/api/push/vapid-key')
        if (!keyResponse.ok) {
          alert('Push notifications not configured. Please check server settings.')
          setIsLoading(false)
          return
        }
        const { publicKey: vapidPublicKey } = await keyResponse.json()

        // Request permission
        const result = await Notification.requestPermission()
        setPermission(result)

        if (result !== 'granted') {
          setIsLoading(false)
          return
        }

        // Register service worker
        await registerServiceWorker()
        const registration = await navigator.serviceWorker.ready

        // Subscribe to push
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
        })

        // Send subscription to server
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            userId: currentUserId,
            morningTime,
            eveningTime,
          }),
        })

        if (response.ok) {
          setIsSubscribed(true)
        } else {
          console.error('Failed to save subscription')
        }
      }
    } catch (error) {
      console.error('Failed to subscribe:', error)
      alert('Failed to enable notifications. Check console for details.')
    } finally {
      setIsLoading(false)
    }
  }

  async function unsubscribe() {
    setIsLoading(true)

    try {
      if (isNative) {
        // Native push unregistration
        const token = deviceTokenRef.current || localStorage.getItem('device_push_token')
        if (token) {
          await unregisterNativePush(token)
          localStorage.removeItem('device_push_token')
          deviceTokenRef.current = null
        }
      } else {
        // Web push unregistration
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (subscription) {
          // Unsubscribe from push
          await subscription.unsubscribe()

          // Remove from server
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          })
        }
      }

      setIsSubscribed(false)
    } catch (error) {
      console.error('Failed to unsubscribe:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function sendTestNotification() {
    try {
      const response = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUserId,
          title: 'Test Notification',
          message: 'Push notifications are working!',
          url: '/today',
        }),
      })

      const data = await response.json()
      console.log('Push send response:', data)

      if (response.ok && data.sent > 0) {
        setTestSent(true)
        setTimeout(() => setTestSent(false), 3000)
      } else if (data.sent === 0) {
        alert('No subscriptions found. Try disabling and re-enabling notifications.')
      } else if (data.error) {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Failed to send test notification:', error)
      alert('Failed to send test notification')
    }
  }

  if (!isSupported) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-[var(--muted-foreground)]">
          <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Push notifications are not supported {isNative ? 'on this device' : 'in this browser'}.</p>
        </CardContent>
      </Card>
    )
  }

  if (permission === 'denied') {
    return (
      <Card>
        <CardContent className="py-6 text-center text-[var(--muted-foreground)]">
          <BellOff className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Notifications are blocked. Please enable them in {isNative ? 'Settings > Notifications' : 'your browser settings'}.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          {isNative ? <Smartphone className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          Dose Reminders
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSubscribed ? (
          <>
            <div className="flex items-center gap-2 text-[var(--success)] bg-[var(--success-muted)] p-3 rounded-lg">
              <Check className="w-5 h-5" />
              <span className="text-sm font-medium">
                {isNative ? 'Native notifications enabled' : 'Notifications enabled'}
              </span>
            </div>

            <div className="space-y-3">
              <Input
                label="Morning reminder"
                type="time"
                value={morningTime}
                onChange={(e) => setMorningTime(e.target.value)}
              />
              <Input
                label="Evening reminder"
                type="time"
                value={eveningTime}
                onChange={(e) => setEveningTime(e.target.value)}
              />
              <p className="text-xs text-[var(--muted-foreground)]">
                You&apos;ll receive reminders at these times if you have pending doses.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={sendTestNotification}
                disabled={testSent}
                className="flex-1"
              >
                {testSent ? 'Sent!' : 'Test Notification'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={unsubscribe}
                disabled={isLoading}
                className="text-[var(--error)] hover:bg-[var(--error-muted)]"
              >
                Disable
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)]">
              Get reminders when it&apos;s time for your doses. Never miss a dose again.
            </p>
            <Button
              onClick={subscribe}
              disabled={isLoading}
              className="w-full"
            >
              {isNative ? <Smartphone className="w-4 h-4 mr-2" /> : <Bell className="w-4 h-4 mr-2" />}
              {isLoading ? 'Enabling...' : 'Enable Notifications'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
