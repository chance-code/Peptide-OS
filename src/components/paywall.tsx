'use client'

import { useEffect, useState } from 'react'
import { X, Check, Sparkles, Zap, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getOfferings,
  purchasePackage,
  restorePurchases,
  isNativePlatform,
} from '@/lib/purchases'

interface Package {
  identifier: string
  packageType: string
  product: {
    title: string
    description: string
    priceString: string
    price: number
  }
}

interface PaywallProps {
  isOpen: boolean
  onClose: () => void
  onPurchaseSuccess: () => void
}

export function Paywall({ isOpen, onClose, onPurchaseSuccess }: PaywallProps) {
  const [packages, setPackages] = useState<Package[]>([])
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadOfferings()
    }
  }, [isOpen])

  async function loadOfferings() {
    const offering = await getOfferings()
    if (offering?.availablePackages) {
      setPackages(offering.availablePackages as Package[])
      // Select annual by default (best value)
      const annual = offering.availablePackages.find(
        (p: Package) => p.packageType === 'ANNUAL'
      )
      setSelectedPackage((annual as Package) || (offering.availablePackages[0] as Package))
    }
  }

  async function handlePurchase() {
    if (!selectedPackage) return

    setIsLoading(true)
    setError(null)

    const success = await purchasePackage(selectedPackage)

    setIsLoading(false)

    if (success) {
      onPurchaseSuccess()
      onClose()
    } else {
      setError('Purchase was cancelled or failed. Please try again.')
    }
  }

  async function handleRestore() {
    setIsRestoring(true)
    setError(null)

    const success = await restorePurchases()

    setIsRestoring(false)

    if (success) {
      onPurchaseSuccess()
      onClose()
    } else {
      setError('No previous purchases found to restore.')
    }
  }

  if (!isOpen) return null

  // For web, show a message
  if (!isNativePlatform()) {
    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="text-center py-8">
            <Sparkles className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Premium Available on iOS
            </h2>
            <p className="text-slate-600">
              Download the Peptide OS app from the App Store to unlock premium features.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 z-10"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-t-2xl text-white text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Upgrade to Premium</h2>
          <p className="text-slate-300 text-sm">
            Unlock the full power of Peptide OS
          </p>
        </div>

        {/* Features */}
        <div className="p-6 border-b border-slate-100">
          <div className="space-y-3">
            {[
              'Unlimited protocols',
              'AI chat assistant',
              'Inventory expiration alerts',
              'Advanced analytics',
              'Priority support',
              'All future features',
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Check className="w-3 h-3 text-emerald-600" />
                </div>
                <span className="text-slate-700">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Options */}
        <div className="p-6 space-y-3">
          {packages.length > 0 ? (
            packages.map((pkg) => {
              const isSelected = selectedPackage?.identifier === pkg.identifier
              const isAnnual = pkg.packageType === 'ANNUAL'
              const isLifetime = pkg.packageType === 'LIFETIME'

              return (
                <button
                  key={pkg.identifier}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left relative ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {isAnnual && (
                    <span className="absolute -top-2 left-4 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                      BEST VALUE
                    </span>
                  )}
                  {isLifetime && (
                    <span className="absolute -top-2 left-4 bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                      ONE TIME
                    </span>
                  )}
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {pkg.product.title}
                      </div>
                      <div className="text-sm text-slate-500">
                        {pkg.product.description}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-900">
                        {pkg.product.priceString}
                      </div>
                      {isAnnual && (
                        <div className="text-xs text-emerald-600">
                          Save 40%
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          ) : (
            // Fallback display when packages haven't loaded
            <div className="space-y-3">
              <div className="p-4 rounded-xl border-2 border-slate-200">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-slate-900">Monthly</div>
                    <div className="text-sm text-slate-500">Billed monthly</div>
                  </div>
                  <div className="font-bold text-slate-900">$6.99/mo</div>
                </div>
              </div>
              <div className="p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 relative">
                <span className="absolute -top-2 left-4 bg-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded">
                  BEST VALUE
                </span>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-slate-900">Annual</div>
                    <div className="text-sm text-slate-500">Billed yearly</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-slate-900">$49.99/yr</div>
                    <div className="text-xs text-emerald-600">Save 40%</div>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl border-2 border-slate-200">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-slate-900">Lifetime</div>
                    <div className="text-sm text-slate-500">One-time purchase</div>
                  </div>
                  <div className="font-bold text-slate-900">$99.99</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="px-6 pb-4">
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">
              {error}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="p-6 pt-0 space-y-3">
          <Button
            onClick={handlePurchase}
            disabled={isLoading || !selectedPackage}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-6 text-lg font-semibold"
          >
            {isLoading ? 'Processing...' : 'Continue'}
          </Button>

          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="w-full text-slate-500 text-sm hover:text-slate-700"
          >
            {isRestoring ? 'Restoring...' : 'Restore Purchases'}
          </button>

          <div className="flex items-center justify-center gap-4 text-xs text-slate-400">
            <Shield className="w-4 h-4" />
            <span>Secured by Apple. Cancel anytime.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
