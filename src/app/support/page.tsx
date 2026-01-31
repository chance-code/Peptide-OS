import { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Support - Peptide OS',
}

export default function SupportPage() {
  return (
    <div className="min-h-screen bg-white p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Support</h1>

      <div className="space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Frequently Asked Questions</h2>

          <div className="space-y-4">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-medium text-slate-900 mb-1">How do I add a new protocol?</h3>
              <p className="text-slate-600 text-sm">
                Go to the Protocols tab and tap the "Add" button. Select a peptide (or create a new one),
                enter your dosing details, and set your schedule.
              </p>
            </div>

            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-medium text-slate-900 mb-1">How do I track my inventory?</h3>
              <p className="text-slate-600 text-sm">
                Go to the Inventory tab and tap "Add" to add a new vial. Enter the peptide, amount,
                and reconstitution details. The app will track expiration dates and alert you when
                vials are expiring.
              </p>
            </div>

            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-medium text-slate-900 mb-1">How does the AI chat work?</h3>
              <p className="text-slate-600 text-sm">
                The chat assistant can answer questions about peptides and provide personalized
                suggestions based on your current protocols. It's powered by OpenAI and considers
                your active protocols when giving recommendations.
              </p>
            </div>

            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-medium text-slate-900 mb-1">Is my data secure?</h3>
              <p className="text-slate-600 text-sm">
                Yes. Your data is stored securely with encryption in transit. Chat history is stored
                locally on your device. See our <Link href="/privacy" className="text-blue-600 underline">Privacy Policy</Link> for
                full details.
              </p>
            </div>

            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-medium text-slate-900 mb-1">Can I use multiple profiles?</h3>
              <p className="text-slate-600 text-sm">
                Yes. Go to Settings to create additional profiles. Each profile has separate
                protocols, inventory, and chat history. You can switch between profiles at any time.
              </p>
            </div>

            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-medium text-slate-900 mb-1">How do I calculate reconstitution?</h3>
              <p className="text-slate-600 text-sm">
                Use the Calculator tab. Enter your vial amount and how much bacteriostatic water
                you'll add. The calculator will show your concentration and how many units to draw
                for your target dose.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Contact Us</h2>
          <p className="text-slate-600 mb-4">
            Have a question not answered here? We're here to help.
          </p>
          <div className="space-y-2">
            <p className="text-slate-600">
              <strong>Email:</strong>{' '}
              <a href="mailto:support@peptideos.app" className="text-blue-600 underline">
                support@peptideos.app
              </a>
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-3">Legal</h2>
          <div className="space-y-2">
            <p>
              <Link href="/privacy" className="text-blue-600 underline">
                Privacy Policy
              </Link>
            </p>
            <p>
              <Link href="/terms" className="text-blue-600 underline">
                Terms of Service
              </Link>
            </p>
          </div>
        </section>

        <section className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h2 className="text-lg font-semibold text-amber-900 mb-2">Medical Disclaimer</h2>
          <p className="text-amber-800 text-sm">
            Peptide OS is a tracking tool only and does not provide medical advice, diagnosis,
            or treatment. Always consult with a qualified healthcare provider before starting
            any supplement regimen.
          </p>
        </section>
      </div>
    </div>
  )
}
