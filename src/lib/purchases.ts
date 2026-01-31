import { Capacitor } from '@capacitor/core'

// RevenueCat configuration
// You'll get this API key from RevenueCat dashboard after creating your app
export const REVENUECAT_API_KEY = process.env.NEXT_PUBLIC_REVENUECAT_API_KEY || ''

// Product identifiers (must match what you set up in App Store Connect)
export const PRODUCTS = {
  MONTHLY: 'peptideos_monthly_699',
  ANNUAL: 'peptideos_annual_4999',
  LIFETIME: 'peptideos_lifetime_9999',
} as const

// Entitlement identifier (set up in RevenueCat)
export const ENTITLEMENT_ID = 'premium'

// Check if running on native platform
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}

// Initialize RevenueCat - call this on app startup
export async function initializePurchases(userId?: string): Promise<void> {
  if (!isNativePlatform()) {
    console.log('Purchases: Not on native platform, skipping initialization')
    return
  }

  if (!REVENUECAT_API_KEY) {
    console.warn('Purchases: No RevenueCat API key configured')
    return
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')

    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId || undefined,
    })

    console.log('Purchases: RevenueCat initialized')
  } catch (error) {
    console.error('Purchases: Failed to initialize', error)
  }
}

// Get available packages/products
export async function getOfferings() {
  if (!isNativePlatform()) {
    return null
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    const offerings = await Purchases.getOfferings()
    return offerings.current
  } catch (error) {
    console.error('Purchases: Failed to get offerings', error)
    return null
  }
}

// Check if user has premium access
export async function checkPremiumAccess(): Promise<boolean> {
  if (!isNativePlatform()) {
    // On web, assume premium for now (or implement your own check)
    return true
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    const customerInfo = await Purchases.getCustomerInfo()

    return customerInfo.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
  } catch (error) {
    console.error('Purchases: Failed to check premium access', error)
    return false
  }
}

// Purchase a package
export async function purchasePackage(packageToPurchase: unknown): Promise<boolean> {
  if (!isNativePlatform()) {
    return false
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    // @ts-expect-error - Package type from RevenueCat
    const result = await Purchases.purchasePackage({ aPackage: packageToPurchase })

    // Check if purchase gave premium access
    return result.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
  } catch (error) {
    // User cancelled or error occurred
    console.error('Purchases: Purchase failed', error)
    return false
  }
}

// Restore previous purchases
export async function restorePurchases(): Promise<boolean> {
  if (!isNativePlatform()) {
    return false
  }

  try {
    const { Purchases } = await import('@revenuecat/purchases-capacitor')
    const customerInfo = await Purchases.restorePurchases()

    return customerInfo.customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined
  } catch (error) {
    console.error('Purchases: Restore failed', error)
    return false
  }
}
