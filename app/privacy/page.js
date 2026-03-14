export const metadata = {
  title: "Privacy Policy — Helm Business OS",
  description: "Privacy Policy for Helm Business OS",
};

const EFFECTIVE_DATE = "March 14, 2026";
const COMPANY = "Earth Breeze Inc.";
const APP = "Helm Business OS";
const CONTACT_EMAIL = "privacy@earthbreeze.com";
const SITE = "helm-app-six.vercel.app";

export default function PrivacyPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e8e6e0",
      fontFamily: "'Georgia', 'Times New Roman', serif",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: "1px solid #1e1e2e",
        padding: "20px 0",
        position: "sticky", top: 0,
        background: "#0a0a0f",
        zIndex: 10,
      }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #4f7fff, #7c3aed)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 900, color: "#fff", fontFamily: "sans-serif",
            }}>H</div>
            <span style={{ fontSize: 16, fontWeight: 600, fontFamily: "sans-serif", color: "#e8e6e0", letterSpacing: "-0.02em" }}>Helm</span>
          </div>
          <a href={`https://${SITE}`} style={{ fontSize: 13, color: "#6b7280", textDecoration: "none", fontFamily: "sans-serif" }}>← Back to app</a>
        </div>
      </header>

      <main style={{ maxWidth: 800, margin: "0 auto", padding: "60px 32px 100px" }}>
        {/* Title block */}
        <div style={{ marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontFamily: "sans-serif", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#4f7fff", marginBottom: 16 }}>Legal</div>
          <h1 style={{ fontSize: 42, fontWeight: 400, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 20px", color: "#f0ede8" }}>Privacy Policy</h1>
          <p style={{ fontSize: 15, color: "#6b7280", fontFamily: "sans-serif", lineHeight: 1.6, margin: 0 }}>
            Effective date: {EFFECTIVE_DATE} &nbsp;·&nbsp; {COMPANY}
          </p>
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.85, color: "#c8c5bf" }}>

          <Section title="1. Introduction">
            <p>{APP} ("Helm", "we", "us", or "our") is a business operating system developed by {COMPANY}. This Privacy Policy describes how we collect, use, disclose, and protect information about you when you use our application and services (collectively, the "Services").</p>
            <p>By using Helm, you agree to the collection and use of information in accordance with this policy. If you do not agree, please discontinue use of the Services.</p>
          </Section>

          <Section title="2. Information We Collect">
            <Subsection title="2.1 Information You Provide">
              <ul>
                <li><strong>Account information:</strong> name, email address, job title, and password when you register</li>
                <li><strong>Organization data:</strong> company name, team members, and workspace configuration</li>
                <li><strong>Business data:</strong> OKRs, project data, PLM program information, financial metrics, and other operational data you enter into Helm</li>
                <li><strong>Integration credentials:</strong> OAuth tokens and API keys for third-party services you connect (QuickBooks Online, Google Sheets, Slack, etc.)</li>
                <li><strong>Communications:</strong> support requests, feedback, and correspondence with our team</li>
              </ul>
            </Subsection>
            <Subsection title="2.2 Information Collected Automatically">
              <ul>
                <li><strong>Usage data:</strong> features used, pages visited, actions taken within the application</li>
                <li><strong>Device information:</strong> browser type, operating system, IP address, and device identifiers</li>
                <li><strong>Log data:</strong> server logs, error reports, and performance data</li>
                <li><strong>Cookies:</strong> session cookies and authentication tokens necessary to operate the service</li>
              </ul>
            </Subsection>
            <Subsection title="2.3 Information from Third-Party Integrations">
              <p>When you connect third-party services, we receive data from those services as permitted by your authorization. For example:</p>
              <ul>
                <li><strong>QuickBooks Online:</strong> chart of accounts, P&L data, vendor records, bills, customer records, and invoice data</li>
                <li><strong>Google Sheets:</strong> spreadsheet data from sheets you explicitly authorize</li>
                <li><strong>Slack:</strong> the ability to send notifications to designated channels or direct messages</li>
              </ul>
              <p>We only access the data necessary to provide the integration functionality you have requested.</p>
            </Subsection>
          </Section>

          <Section title="3. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, operate, and improve the Services</li>
              <li>Authenticate users and maintain account security</li>
              <li>Sync and display data from connected third-party integrations</li>
              <li>Send notifications, alerts, and operational updates relevant to your workspace</li>
              <li>Respond to support requests and communicate with you about the Services</li>
              <li>Monitor for security incidents and prevent fraud or abuse</li>
              <li>Comply with legal obligations</li>
              <li>Analyze usage patterns to improve performance and user experience</li>
            </ul>
            <p>We do not sell your personal information to third parties. We do not use your business data for advertising purposes.</p>
          </Section>

          <Section title="4. QuickBooks Online Data">
            <p>Helm integrates with Intuit's QuickBooks Online platform. When you authorize this integration:</p>
            <ul>
              <li>We access your QuickBooks data only with your explicit authorization via OAuth 2.0</li>
              <li>Data retrieved includes accounting records you choose to sync (P&L, chart of accounts, vendors, bills, customers, and invoices)</li>
              <li>This data is stored in our secure database and displayed within your Helm workspace</li>
              <li>We do not modify or write data back to your QuickBooks account — Helm is read-only with respect to QuickBooks</li>
              <li>You may disconnect the QuickBooks integration at any time from Settings → Integrations, which will revoke our access</li>
              <li>OAuth tokens are stored encrypted and refreshed automatically per Intuit's token lifecycle</li>
            </ul>
            <p>Our use of QuickBooks data is subject to Intuit's <a href="https://developer.intuit.com/app/developer/qbo/docs/develop/rest-api-features" style={{ color: "#4f7fff" }}>developer terms</a> and platform policies.</p>
          </Section>

          <Section title="5. Data Sharing and Disclosure">
            <p>We share your information only in the following circumstances:</p>
            <ul>
              <li><strong>Service providers:</strong> We use Supabase (database and authentication), Vercel (hosting), and Anthropic (AI features) as infrastructure providers. These providers access data only as necessary to provide their services and are bound by data processing agreements</li>
              <li><strong>Third-party integrations:</strong> When you connect external services, data is exchanged as required to provide that integration</li>
              <li><strong>Legal requirements:</strong> We may disclose information if required by law, subpoena, or other legal process</li>
              <li><strong>Business transfers:</strong> If we are acquired or merge with another entity, your information may be transferred as part of that transaction, subject to the same protections described here</li>
              <li><strong>With your consent:</strong> We will share information in any other circumstance with your explicit consent</li>
            </ul>
          </Section>

          <Section title="6. Data Security">
            <p>We implement industry-standard security measures to protect your information:</p>
            <ul>
              <li>All data is encrypted in transit using TLS 1.2 or higher</li>
              <li>Data at rest is encrypted using AES-256 encryption</li>
              <li>OAuth tokens and API keys are stored encrypted</li>
              <li>Access to production systems is restricted to authorized personnel</li>
              <li>We use row-level security (RLS) policies to ensure data isolation between organizations</li>
            </ul>
            <p>No method of transmission over the Internet is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.</p>
          </Section>

          <Section title="7. Data Retention">
            <p>We retain your data for as long as your account is active or as needed to provide Services. If you close your account, we will delete or anonymize your data within 90 days, except where retention is required by law or for legitimate business purposes such as dispute resolution.</p>
            <p>Integration data synced from third-party services is retained as part of your workspace. You may manually clear this data at any time from within the application.</p>
          </Section>

          <Section title="8. Your Rights">
            <p>Depending on your location, you may have the following rights regarding your personal information:</p>
            <ul>
              <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
              <li><strong>Correction:</strong> Request correction of inaccurate or incomplete data</li>
              <li><strong>Deletion:</strong> Request deletion of your personal data</li>
              <li><strong>Portability:</strong> Request your data in a structured, machine-readable format</li>
              <li><strong>Objection:</strong> Object to processing of your personal data in certain circumstances</li>
              <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
            </ul>
            <p>To exercise any of these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#4f7fff" }}>{CONTACT_EMAIL}</a>. We will respond within 30 days.</p>
          </Section>

          <Section title="9. Cookies">
            <p>Helm uses essential cookies to operate the service, including authentication session cookies. We do not use tracking cookies, advertising cookies, or third-party analytics cookies.</p>
            <p>You may configure your browser to refuse cookies, but this may prevent you from using certain features of the Services.</p>
          </Section>

          <Section title="10. Children's Privacy">
            <p>Helm is a business application intended for use by adults in professional contexts. We do not knowingly collect personal information from individuals under the age of 18. If you believe a minor has provided us personal information, please contact us and we will promptly delete it.</p>
          </Section>

          <Section title="11. International Transfers">
            <p>Helm is operated from the United States. If you are accessing the Services from outside the US, your information may be transferred to and processed in the United States, where data protection laws may differ from your jurisdiction. By using the Services, you consent to this transfer.</p>
          </Section>

          <Section title="12. Changes to This Policy">
            <p>We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy on this page with a new effective date, and where appropriate, by sending you an email notification. Your continued use of the Services after changes become effective constitutes your acceptance of the revised policy.</p>
          </Section>

          <Section title="13. Contact Us">
            <p>If you have questions about this Privacy Policy or our data practices, please contact us:</p>
            <div style={{ background: "#0f0f1a", border: "1px solid #1e1e2e", borderRadius: 10, padding: "20px 24px", marginTop: 16, fontFamily: "sans-serif", fontSize: 14, lineHeight: 2 }}>
              <strong style={{ color: "#f0ede8" }}>{COMPANY}</strong><br />
              Email: <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#4f7fff" }}>{CONTACT_EMAIL}</a><br />
              Website: <a href={`https://${SITE}`} style={{ color: "#4f7fff" }}>https://{SITE}</a>
            </div>
          </Section>
        </div>
      </main>

      <footer style={{ borderTop: "1px solid #1e1e2e", padding: "24px 32px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: "#4b5563", fontFamily: "sans-serif", margin: 0 }}>
          © {new Date().getFullYear()} {COMPANY} · <a href="/privacy" style={{ color: "#4b5563" }}>Privacy Policy</a> · <a href="/terms" style={{ color: "#4b5563" }}>Terms of Service</a>
        </p>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginBottom: 44 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", color: "#f0ede8", fontFamily: "sans-serif", marginBottom: 16, marginTop: 0, paddingTop: 32, borderTop: "1px solid #1e1e2e" }}>{title}</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </section>
  );
}

function Subsection({ title, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: "#e8e6e0", fontFamily: "sans-serif", marginBottom: 10, marginTop: 16 }}>{title}</h3>
      {children}
    </div>
  );
}
