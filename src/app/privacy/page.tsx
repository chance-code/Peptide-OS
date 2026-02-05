import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy - Arc Protocol',
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Privacy Policy</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">Last updated: February 2, 2026</p>

      <div className="prose prose-sm">
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Overview</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Arc Protocol ("we", "our", or "the app") is a personal health tracking application
            that helps users manage their supplement protocols and track health metrics. We are committed to
            protecting your privacy and being transparent about our data practices.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Data We Collect</h2>
          <p className="text-[var(--muted-foreground)] mb-2">The app collects and stores:</p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Profile information (name)</li>
            <li>Supplement protocol details (supplements, dosages, schedules)</li>
            <li>Inventory tracking data (vials, expiration dates)</li>
            <li>Dose logging history</li>
            <li>Chat conversations with the AI assistant</li>
            <li>Health data from connected services (see Apple Health section below)</li>
          </ul>
        </section>

        {/* Apple Health Section - Required for HealthKit compliance */}
        <section className="mb-6 p-4 bg-[var(--muted)] rounded-lg border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Apple Health Integration</h2>

          <h3 className="text-md font-medium text-[var(--foreground)] mt-4 mb-2">Health Data We Access</h3>
          <p className="text-[var(--muted-foreground)] mb-2">
            With your explicit permission, Arc Protocol may read the following data from Apple Health:
          </p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li><strong>Body Measurements:</strong> Weight, body fat percentage, lean body mass, BMI</li>
            <li><strong>Heart:</strong> Heart rate, resting heart rate, heart rate variability (HRV)</li>
            <li><strong>Sleep:</strong> Sleep duration and sleep stages</li>
            <li><strong>Activity:</strong> Steps, distance walked/run, active calories, exercise minutes</li>
            <li><strong>Vitals:</strong> Respiratory rate, blood oxygen saturation, body temperature</li>
          </ul>

          <h3 className="text-md font-medium text-[var(--foreground)] mt-4 mb-2">How We Use Your Health Data</h3>
          <p className="text-[var(--muted-foreground)] mb-2">Your Apple Health data is used exclusively to:</p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Display health trends and metrics within the app</li>
            <li>Correlate health changes with your supplement protocols</li>
            <li>Generate personalized insights about your health progress</li>
            <li>Identify patterns between your protocols and health outcomes</li>
          </ul>

          <h3 className="text-md font-medium text-[var(--foreground)] mt-4 mb-2">Health Data Protection</h3>
          <p className="text-[var(--muted-foreground)] mb-4">
            <strong>We do NOT:</strong>
          </p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Sell your health data to any third party</li>
            <li>Share your health data with advertisers</li>
            <li>Use your health data for marketing purposes</li>
            <li>Transfer your health data to third parties for their independent use</li>
          </ul>
          <p className="text-[var(--muted-foreground)] mb-4">
            Your health data from Apple Health is stored securely on our servers with encryption
            at rest and in transit. This data is associated only with your account and is never
            combined with data from other users for any purpose.
          </p>

          <h3 className="text-md font-medium text-[var(--foreground)] mt-4 mb-2">Your Control Over Health Data</h3>
          <p className="text-[var(--muted-foreground)] mb-4">
            You can revoke Arc Protocol's access to Apple Health at any time through your
            iPhone's Settings &gt; Health &gt; Data Access &amp; Devices &gt; Arc Protocol.
            You can also disconnect the integration within the app and request deletion of
            all synced health data.
          </p>
        </section>

        {/* Third-Party Health Integrations */}
        <section className="mb-6 p-4 bg-[var(--muted)] rounded-lg border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Other Health Integrations</h2>

          <h3 className="text-md font-medium text-[var(--foreground)] mt-4 mb-2">Oura Ring</h3>
          <p className="text-[var(--muted-foreground)] mb-4">
            If you connect your Oura account, we access sleep scores, HRV, heart rate, and activity
            data through Oura's official API. This data is subject to the same protections as
            Apple Health data described above.
          </p>

        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">How We Use Your Data</h2>
          <p className="text-[var(--muted-foreground)] mb-2">Your data is used to:</p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Display your protocols and schedules</li>
            <li>Track your dose history and adherence</li>
            <li>Send optional reminders for scheduled doses</li>
            <li>Provide personalized AI chat responses based on your protocols</li>
            <li>Alert you about expiring inventory</li>
            <li>Generate health insights and correlations</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Data Storage &amp; Security</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Your data is stored securely in cloud databases with encryption at rest.
            All data transmission uses TLS encryption. Chat history is stored locally
            on your device. We use industry-standard security practices to protect your information.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Third-Party Services</h2>
          <p className="text-[var(--muted-foreground)] mb-2">We use the following third-party services:</p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li><strong>OpenAI</strong> - Powers the AI chat assistant. Your protocol information
            may be sent to OpenAI to provide contextual responses. Health data is NOT sent to OpenAI.
            OpenAI's privacy policy applies to chat interactions.</li>
            <li><strong>Vercel</strong> - Hosts the application infrastructure</li>
            <li><strong>Turso</strong> - Database hosting with encryption at rest</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Data Retention</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            We retain your data for as long as your account is active. Health data is retained
            to provide historical trends and insights. You may request deletion of specific
            health data or all data at any time.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Data Sharing</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            We do not sell your personal data or health data. We do not share your data with
            third parties except as required to provide the service (as listed above) or when
            required by law. Health data from Apple Health is never shared with third parties
            for advertising, marketing, or data brokering purposes.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Your Rights</h2>
          <p className="text-[var(--muted-foreground)] mb-2">You have the right to:</p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Access your data through the app</li>
            <li>Delete your profile and all associated data</li>
            <li>Delete specific health integration data</li>
            <li>Disconnect health integrations at any time</li>
            <li>Clear your chat history at any time</li>
            <li>Export your data upon request</li>
            <li>Revoke Apple Health permissions through iOS Settings</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Children's Privacy</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Arc Protocol is not intended for use by children under 17. We do not knowingly
            collect personal information from children under 17. If you believe we have
            collected information from a child, please contact us immediately.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Health Disclaimer</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Arc Protocol is a tracking tool only. It does not provide medical advice, diagnosis,
            or treatment recommendations. The health insights and correlations shown are for
            informational purposes only. Always consult with a qualified healthcare provider
            before starting any supplement regimen or making health decisions.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Contact</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            For privacy-related questions, data requests, or to exercise your rights, contact us at:{' '}
            <a href="mailto:privacy@arcprotocol.app" className="text-blue-600 underline">
              privacy@arcprotocol.app
            </a>
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">Changes to This Policy</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            We may update this privacy policy from time to time. We will notify users of
            significant changes through the app. Continued use of the app after changes
            constitutes acceptance of the updated policy.
          </p>
        </section>
      </div>
    </div>
  )
}
