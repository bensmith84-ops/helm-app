export const metadata = {
  title: "Terms of Service — Helm Business OS",
  description: "End User License Agreement and Terms of Service for Helm Business OS",
};

const EFFECTIVE_DATE = "March 14, 2026";
const COMPANY = "Earth Breeze Inc.";
const APP = "Helm Business OS";
const CONTACT_EMAIL = "legal@earthbreeze.com";
const SITE = "helm-app-six.vercel.app";

export default function TermsPage() {
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
          <h1 style={{ fontSize: 42, fontWeight: 400, lineHeight: 1.15, letterSpacing: "-0.02em", margin: "0 0 20px", color: "#f0ede8" }}>Terms of Service</h1>
          <p style={{ fontSize: 15, color: "#6b7280", fontFamily: "sans-serif", lineHeight: 1.6, margin: 0 }}>
            Effective date: {EFFECTIVE_DATE} &nbsp;·&nbsp; {COMPANY}
          </p>
          <div style={{ marginTop: 20, padding: "14px 18px", background: "#0f1117", border: "1px solid #1e2a3a", borderLeft: "3px solid #4f7fff", borderRadius: "0 8px 8px 0", fontFamily: "sans-serif", fontSize: 13, color: "#8b9ab0", lineHeight: 1.6 }}>
            These Terms of Service constitute a legally binding agreement between you and {COMPANY}. Please read them carefully before using {APP}.
          </div>
        </div>

        <div style={{ fontSize: 16, lineHeight: 1.85, color: "#c8c5bf" }}>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using {APP} ("Helm", "the Service", "we", "us", or "our"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy. If you are using Helm on behalf of an organization, you represent that you have the authority to bind that organization to these Terms, and references to "you" include both you and that organization.</p>
            <p>If you do not agree to these Terms, you may not access or use the Service.</p>
          </Section>

          <Section title="2. License Grant">
            <p>{COMPANY} grants you a limited, non-exclusive, non-transferable, revocable license to access and use Helm solely for your internal business operations, subject to these Terms.</p>
            <p>This license does not include the right to:</p>
            <ul>
              <li>Sublicense, sell, resell, transfer, assign, or commercially exploit the Service</li>
              <li>Modify, make derivative works of, disassemble, decompile, or reverse engineer any part of the Service</li>
              <li>Access the Service to build a competing product or service</li>
              <li>Copy, scrape, or extract any content or data from the Service using automated means</li>
              <li>Remove or alter any proprietary notices or labels on the Service</li>
            </ul>
          </Section>

          <Section title="3. Account Registration and Security">
            <p>To use Helm, you must create an account by providing accurate and complete information. You are responsible for:</p>
            <ul>
              <li>Maintaining the confidentiality of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Notifying us immediately of any unauthorized access or security breach</li>
              <li>Ensuring all users in your organization comply with these Terms</li>
            </ul>
            <p>We reserve the right to suspend or terminate accounts that we reasonably believe have been compromised or used in violation of these Terms.</p>
          </Section>

          <Section title="4. Acceptable Use">
            <p>You agree to use Helm only for lawful purposes and in accordance with these Terms. You may not use the Service to:</p>
            <ul>
              <li>Violate any applicable laws, regulations, or third-party rights</li>
              <li>Transmit any material that is defamatory, obscene, fraudulent, or harmful</li>
              <li>Attempt to gain unauthorized access to any part of the Service or its related systems</li>
              <li>Interfere with or disrupt the integrity or performance of the Service</li>
              <li>Transmit malware, viruses, or any other malicious code</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity</li>
              <li>Engage in any activity that could damage, disable, or impair the Service</li>
            </ul>
          </Section>

          <Section title="5. Third-Party Integrations">
            <Subsection title="5.1 General">
              <p>Helm integrates with third-party services including QuickBooks Online (Intuit), Google Sheets, and Slack. Your use of these integrations is subject to the applicable third-party terms of service and privacy policies.</p>
            </Subsection>
            <Subsection title="5.2 QuickBooks Online">
              <p>By connecting QuickBooks Online to Helm, you authorize us to access your QuickBooks data on your behalf as permitted by your authorization. You represent that you have the right to grant this access. Our use of QuickBooks data is governed by Intuit's Platform Agreement and Data Stewardship Guidelines. Helm accesses QuickBooks in read-only mode and does not modify your QuickBooks data.</p>
            </Subsection>
            <Subsection title="5.3 No Liability for Third-Party Services">
              <p>We are not responsible for the availability, accuracy, or performance of any third-party service. We are not liable for any loss or damage arising from your use of third-party integrations or any changes made by third-party providers to their services or APIs.</p>
            </Subsection>
          </Section>

          <Section title="6. Your Data">
            <Subsection title="6.1 Ownership">
              <p>You retain all ownership rights to the data you input into Helm ("Your Data"). We do not claim any intellectual property rights over Your Data.</p>
            </Subsection>
            <Subsection title="6.2 License to Us">
              <p>By using Helm, you grant {COMPANY} a limited, worldwide, royalty-free license to store, process, and display Your Data solely as necessary to provide the Service to you.</p>
            </Subsection>
            <Subsection title="6.3 Data Accuracy">
              <p>You are solely responsible for the accuracy, quality, and legality of Your Data and the means by which you acquired it. We are not responsible for any loss or corruption of Your Data.</p>
            </Subsection>
            <Subsection title="6.4 Data Backup">
              <p>While we implement reasonable data backup procedures, you are responsible for maintaining independent backups of Your Data. We are not liable for any data loss.</p>
            </Subsection>
          </Section>

          <Section title="7. Intellectual Property">
            <p>{COMPANY} and its licensors own all right, title, and interest in and to the Service, including all intellectual property rights. The Helm name, logo, and all related names, logos, product and service names, designs, and slogans are trademarks of {COMPANY}.</p>
            <p>Nothing in these Terms grants you any right to use our trademarks, trade names, service marks, or product names, except as required for reasonable and customary use in describing your use of the Service.</p>
          </Section>

          <Section title="8. Privacy">
            <p>Your use of the Service is also governed by our <a href="/privacy" style={{ color: "#4f7fff" }}>Privacy Policy</a>, which is incorporated into these Terms by reference. By using the Service, you consent to the collection and use of your information as described in the Privacy Policy.</p>
          </Section>

          <Section title="9. Fees and Payment">
            <p>Helm is currently provided to authorized users of {COMPANY} at no charge. If we introduce paid plans in the future, we will provide reasonable notice and the opportunity to accept new terms before any fees apply.</p>
          </Section>

          <Section title="10. Disclaimer of Warranties">
            <p style={{ textTransform: "uppercase", fontSize: 14, letterSpacing: "0.01em" }}>THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.</p>
            <p>{COMPANY} does not warrant that:</p>
            <ul>
              <li>The Service will be uninterrupted, error-free, or secure</li>
              <li>Any errors or defects will be corrected</li>
              <li>The Service is free of viruses or other harmful components</li>
              <li>The results obtained from using the Service will be accurate or reliable</li>
            </ul>
          </Section>

          <Section title="11. Limitation of Liability">
            <p style={{ textTransform: "uppercase", fontSize: 14, letterSpacing: "0.01em" }}>TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, {COMPANY.toUpperCase()} AND ITS OFFICERS, EMPLOYEES, AGENTS, PARTNERS, AND LICENSORS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, GOODWILL, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR INABILITY TO USE THE SERVICE.</p>
            <p>Our total liability to you for any claims arising from or relating to these Terms or the Service shall not exceed $100 USD or the amount you paid us in the past 12 months, whichever is greater.</p>
          </Section>

          <Section title="12. Indemnification">
            <p>You agree to defend, indemnify, and hold harmless {COMPANY} and its officers, directors, employees, and agents from and against any claims, liabilities, damages, judgments, awards, losses, costs, expenses, or fees (including reasonable legal fees) arising out of or relating to your violation of these Terms or your use of the Service.</p>
          </Section>

          <Section title="13. Term and Termination">
            <p>These Terms are effective until terminated. We may terminate or suspend your access immediately, without prior notice or liability, if you breach these Terms. Upon termination, your right to use the Service will immediately cease.</p>
            <p>You may terminate your account at any time by contacting us at <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#4f7fff" }}>{CONTACT_EMAIL}</a>. We will delete your data within 90 days of account termination, subject to our data retention obligations.</p>
          </Section>

          <Section title="14. Governing Law">
            <p>These Terms shall be governed by and construed in accordance with the laws of the State of Delaware, without regard to its conflict of law provisions. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts located in Delaware.</p>
          </Section>

          <Section title="15. Changes to Terms">
            <p>We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting updated Terms on this page with a new effective date. Your continued use of the Service after changes become effective constitutes your acceptance of the revised Terms.</p>
          </Section>

          <Section title="16. Miscellaneous">
            <ul>
              <li><strong>Entire Agreement:</strong> These Terms and our Privacy Policy constitute the entire agreement between you and {COMPANY} regarding the Service</li>
              <li><strong>Severability:</strong> If any provision of these Terms is found invalid, the remaining provisions will remain in full force and effect</li>
              <li><strong>Waiver:</strong> Our failure to enforce any right or provision of these Terms will not be considered a waiver of those rights</li>
              <li><strong>Assignment:</strong> You may not assign your rights under these Terms without our prior written consent</li>
              <li><strong>No Third-Party Beneficiaries:</strong> These Terms are for the benefit of you and {COMPANY} only and do not create any third-party beneficiary rights</li>
            </ul>
          </Section>

          <Section title="17. Contact">
            <p>For questions about these Terms, please contact:</p>
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
