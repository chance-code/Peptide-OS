import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terms of Service - Peptide OS',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-6">Terms of Service</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">Last updated: January 30, 2025</p>

      <div className="prose prose-sm">
        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">1. Acceptance of Terms</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            By using Peptide OS ("the app"), you agree to these Terms of Service. If you
            do not agree, please do not use the app.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">2. Description of Service</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Peptide OS is a personal health tracking application that helps users organize
            and track their peptide supplement protocols. The app provides scheduling,
            inventory management, and an AI-powered chat assistant.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">3. Medical Disclaimer</h2>
          <div className="bg-[var(--warning-muted)] border border-[var(--warning)]/30 rounded-lg p-4 mb-4">
            <p className="text-[var(--foreground)] font-semibold mb-2">
              IMPORTANT - PLEASE READ CAREFULLY
            </p>
            <p className="text-[var(--warning)] text-sm">
              Peptide OS is NOT a medical device, NOT FDA-approved, and does NOT provide
              medical advice, diagnosis, treatment recommendations, or prescriptions.
            </p>
          </div>
          <p className="text-[var(--muted-foreground)] mb-4">
            This app is a personal tracking and organization tool ONLY. It is designed to help
            users log and track information they choose to enter. The app does not:
          </p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Recommend, prescribe, or endorse any peptides, supplements, or treatments</li>
            <li>Provide medical advice or guidance on dosing, timing, or protocols</li>
            <li>Diagnose any medical condition</li>
            <li>Replace consultation with qualified healthcare professionals</li>
            <li>Guarantee the accuracy of any calculations or information displayed</li>
          </ul>
          <p className="text-[var(--muted-foreground)] mb-4">
            The reconstitution calculator and reference information are mathematical tools only.
            Any dosing information, peptide data, or protocol suggestions displayed in the app
            are user-entered or for general educational reference only. Users are solely
            responsible for verifying all information with qualified healthcare providers.
          </p>
          <p className="text-[var(--muted-foreground)] mb-4">
            Information provided by the AI chat assistant is for general informational purposes
            only and may contain errors. AI responses should never be relied upon for medical
            decisions.
          </p>
          <p className="text-[var(--muted-foreground)] mb-4 font-medium">
            ALWAYS consult with a qualified healthcare provider before starting, stopping,
            or modifying any supplement, peptide, or medication regimen. Never disregard
            professional medical advice or delay seeking it based on information from this app.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">4. User Responsibilities</h2>
          <p className="text-[var(--muted-foreground)] mb-2">You agree to:</p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Provide accurate information when using the app</li>
            <li>Keep your account credentials secure</li>
            <li>Use the app only for personal, non-commercial purposes</li>
            <li>Not attempt to reverse engineer or compromise the app</li>
            <li>Comply with all applicable laws regarding supplement use in your jurisdiction</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">5. Subscriptions and Payments</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            If you purchase a subscription, payment will be charged to your Apple ID account
            at confirmation of purchase. Subscriptions automatically renew unless cancelled
            at least 24 hours before the end of the current period. You can manage and cancel
            subscriptions in your Apple ID account settings.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">6. Intellectual Property</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            The app, including its design, features, and content, is owned by Peptide OS
            and protected by intellectual property laws. You may not copy, modify, or
            distribute any part of the app without permission.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">7. Assumption of Risk</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            You acknowledge and agree that the use of peptides, supplements, and similar
            substances carries inherent risks. BY USING THIS APP, YOU EXPRESSLY ASSUME ALL
            RISKS associated with your use of any substances you choose to track, including
            but not limited to adverse health effects, interactions with medications, and
            legal implications in your jurisdiction.
          </p>
          <p className="text-[var(--muted-foreground)] mb-4">
            You are solely responsible for researching and understanding the legal status,
            safety, proper handling, and appropriate use of any substances you track in
            this app. The inclusion of any peptide or substance in the app's reference
            database does not constitute an endorsement or recommendation.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">8. Limitation of Liability</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, PEPTIDE OS, ITS CREATORS,
            AFFILIATES, AND SERVICE PROVIDERS SHALL NOT BE LIABLE FOR ANY DIRECT, INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM:
          </p>
          <ul className="list-disc list-inside text-[var(--muted-foreground)] space-y-1 mb-4">
            <li>Your use of or inability to use the app</li>
            <li>Any health-related outcomes, injuries, or adverse effects</li>
            <li>Errors, inaccuracies, or omissions in any content or calculations</li>
            <li>Reliance on information displayed in the app or provided by the AI assistant</li>
            <li>Unauthorized access to or alteration of your data</li>
            <li>Any third-party conduct or content</li>
          </ul>
          <p className="text-[var(--muted-foreground)] mb-4">
            IN NO EVENT SHALL OUR TOTAL LIABILITY EXCEED THE AMOUNT YOU PAID FOR THE APP
            IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR $100, WHICHEVER IS LESS.
          </p>
          <p className="text-[var(--muted-foreground)] mb-4">
            Some jurisdictions do not allow the exclusion of certain warranties or limitation
            of liability, so some of the above limitations may not apply to you.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">9. Indemnification</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            You agree to indemnify, defend, and hold harmless Peptide OS, its creators,
            affiliates, officers, directors, employees, and agents from any claims, damages,
            losses, liabilities, costs, and expenses (including reasonable attorneys' fees)
            arising from your use of the app, your violation of these terms, or your
            violation of any rights of another party.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">10. Data and Privacy</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            Your use of the app is also governed by our Privacy Policy. By using the app,
            you consent to the collection and use of data as described in the Privacy Policy.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">11. Service Availability</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            We strive to keep the app available at all times but do not guarantee uninterrupted
            access. We may modify, suspend, or discontinue features at any time without notice.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">12. Governing Law</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            These terms shall be governed by and construed in accordance with the laws of
            the State of California, without regard to its conflict of law provisions.
            Any disputes arising under these terms shall be subject to the exclusive
            jurisdiction of the courts located in California.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">13. Changes to Terms</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            We may update these terms from time to time. Continued use of the app after
            changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-2">14. Contact</h2>
          <p className="text-[var(--muted-foreground)] mb-4">
            For questions about these terms, contact us at: support@peptideos.app
          </p>
        </section>
      </div>
    </div>
  )
}
