import { Bell } from 'lucide-react';

export default function FollowupsPage() {
  return <ComingSoon icon={<Bell size={20} />} title="Follow-ups" blurb="Overdue pings and scheduled replies — wired up once messages are logged." />;
}

function ComingSoon({ icon, title, blurb }) {
  return (
    <div style={{ padding: '6rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'inline-flex' }}>{icon}</div>
      <div className="font-serif" style={{ fontSize: '2rem', fontWeight: 300, color: 'var(--text)', marginBottom: '0.75rem' }}>
        {title}
      </div>
      <div className="label" style={{ marginBottom: '1rem' }}>Coming soon</div>
      <div style={{ maxWidth: 420, margin: '0 auto', fontSize: '0.95rem', lineHeight: 1.6 }}>
        {blurb}
      </div>
    </div>
  );
}
