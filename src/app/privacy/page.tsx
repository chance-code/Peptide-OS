import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - Peptide OS',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
      <p className="text-sm text-slate-500 mb-6">Last updated: January 30, 2025</p>

      <div className="prose prose-slate prose-sm">
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Overview</h2>
          <p className="text-slate-600 mb-4">
            Peptide OS ("we", "our", or "the app") is a personal health tracking application
            that helps users manage their peptide supplement protocols. We are committed to
            protecting your privacy and being transparent about our data practices.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Data We Collect</h2>
          <p className="text-slate-600 mb-2">The app collects and stores:</p>
          <ul className="list-disc list-inside text-slate-600 space-y-1 mb-4">
            <li>Profile information (name)</li>
            <li>Peptide protocol details (supplements, dosages, schedules)</li>
            <li>Inventory tracking data (vials, expiration dates)</li>
            <li>Dose logging history</li>
            <li>Chat conversations with the AI assistant</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">How We Use Your Data</h2>
          <p className="text-slate-600 mb-2">Your data is used to:</p>
          <ul className="list-disc list-inside text-slate-600 space-y-1 mb-4">
            <li>Display your protocols and schedules</li>
            <li>Track your dose history and adherence</li>
            <li>Send optional reminders for scheduled doses</li>
            <li>Provide personalized AI chat responses based on your protocols</li>
            <li>Alert you about expiring inventory</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Data Storage</h2>
          <p className="text-slate-600 mb-4">
            Your data is stored securely in cloud databases. Chat history is stored locally
            on your device. We use industry-standard encryption for data transmission.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Third-Party Services</h2>
          <p className="text-slate-600 mb-2">We use the following third-party services:</p>
          <ul className="list-disc list-inside text-slate-600 space-y-1 mb-4">
            <li><strong>OpenAI</strong> - Powers the AI chat assistant. Your protocol information
            may be sent to OpenAI to provide contextual responses. OpenAI's privacy policy
            applies to this data.</li>
            <li><strong>Vercel</strong> - Hosts the application infrastructure</li>
            <li><strong>Turso</strong> - Database hosting</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Data Sharing</h2>
          <p className="text-slate-600 mb-4">
            We do not sell your personal data. We do not share your data with third parties
            except as required to provide the service (as listed above) or when required by law.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Your Rights</h2>
          <p className="text-slate-600 mb-2">You have the right to:</p>
          <ul className="list-disc list-inside text-slate-600 space-y-1 mb-4">
            <li>Access your data through the app</li>
            <li>Delete your profile and all associated data</li>
            <li>Clear your chat history at any time</li>
            <li>Export your data upon request</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Health Disclaimer</h2>
          <p className="text-slate-600 mb-4">
            Peptide OS is a tracking tool only. It does not provide medical advice, diagnosis,
            or treatment recommendations. Always consult with a qualified healthcare provider
            before starting any supplement regimen.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Contact</h2>
          <p className="text-slate-600 mb-4">
            For privacy-related questions or data requests, contact us at:
            privacy@peptideos.app
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Changes to This Policy</h2>
          <p className="text-slate-600 mb-4">
            We may update this privacy policy from time to time. We will notify users of
            significant changes through the app.
          </p>
        </section>
      </div>
    </div>
  )
}
