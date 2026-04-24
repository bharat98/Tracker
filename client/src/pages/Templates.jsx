import { FileText } from 'lucide-react';

export default function TemplatesPage() {
  return (
    <div style={{ padding: '6rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'inline-flex' }}>
        <FileText size={20} />
      </div>
      <div className="font-serif" style={{ fontSize: '2rem', fontWeight: 300, color: 'var(--text)', marginBottom: '0.75rem' }}>
        Templates
      </div>
      <div className="label" style={{ marginBottom: '1rem' }}>Coming soon</div>
      <div style={{ maxWidth: 420, margin: '0 auto', fontSize: '0.95rem', lineHeight: 1.6 }}>
        Reusable outreach scripts with placeholders and reply-rate tracking.
      </div>
    </div>
  );
}
