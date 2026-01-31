import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - Peptide OS',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Terms of Service</h1>
      <p className="text-sm text-slate-500 mb-6">Last updated: January 30, 2025</p>

      <div className="prose prose-slate prose-sm">
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">1. Acceptance of Terms</h2>
          <p className="text-slate-600 mb-4">
            By using Peptide OS ("the app"), you agree to these Terms of Service. If you
            do not agree, please do not use the app.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">2. Description of Service</h2>
          <p className="text-slate-600 mb-4">
            Peptide OS is a personal health tracking application that helps users organize
            and track their peptide supplement protocols. The app provides scheduling,
            inventory management, and an AI-powered chat assistant.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">3. Medical Disclaimer</h2>
          <p className="text-slate-600 mb-4">
            <strong>IMPORTANT:</strong> Peptide OS is not a medical device and does not provide
            medical advice, diagnosis, or treatment. The app is a tracking and organization
            tool only. Information provided by the AI assistant is for informational purposes
            only and should not be considered medical advice.
          </p>
          <p className="text-slate-600 mb-4">
            Always consult with a qualified healthcare provider before starting, stopping,
            or modifying any supplement regimen. Never disregard professional medical advice
            based on information from this app.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">4. User Responsibilities</h2>
          <p className="text-slate-600 mb-2">You agree to:</p>
          <ul className="list-disc list-inside text-slate-600 space-y-1 mb-4">
            <li>Provide accurate information when using the app</li>
            <li>Keep your account credentials secure</li>
            <li>Use the app only for personal, non-commercial purposes</li>
            <li>Not attempt to reverse engineer or compromise the app</li>
            <li>Comply with all applicable laws regarding supplement use in your jurisdiction</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">5. Subscriptions and Payments</h2>
          <p className="text-slate-600 mb-4">
            If you purchase a subscription, payment will be charged to your Apple ID account
            at confirmation of purchase. Subscriptions automatically renew unless cancelled
            at least 24 hours before the end of the current period. You can manage and cancel
            subscriptions in your Apple ID account settings.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">6. Intellectual Property</h2>
          <p className="text-slate-600 mb-4">
            The app, including its design, features, and content, is owned by Peptide OS
            and protected by intellectual property laws. You may not copy, modify, or
            distribute any part of the app without permission.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">7. Limitation of Liability</h2>
          <p className="text-slate-600 mb-4">
            To the maximum extent permitted by law, Peptide OS and its creators shall not
            be liable for any indirect, incidental, special, consequential, or punitive
            damages arising from your use of the app. This includes, but is not limited to,
            any health-related outcomes from following information displayed in the app.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">8. Data and Privacy</h2>
          <p className="text-slate-600 mb-4">
            Your use of the app is also governed by our Privacy Policy. By using the app,
            you consent to the collection and use of data as described in the Privacy Policy.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">9. Service Availability</h2>
          <p className="text-slate-600 mb-4">
            We strive to keep the app available at all times but do not guarantee uninterrupted
            access. We may modify, suspend, or discontinue features at any time without notice.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">10. Changes to Terms</h2>
          <p className="text-slate-600 mb-4">
            We may update these terms from time to time. Continued use of the app after
            changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">11. Contact</h2>
          <p className="text-slate-600 mb-4">
            For questions about these terms, contact us at: support@peptideos.app
          </p>
        </section>
      </div>
    </div>
  )
}
