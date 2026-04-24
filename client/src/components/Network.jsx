import { useMemo } from 'react';
import { C } from '../theme.js';

// Early skeleton of the Network tab. Full Contacts/Messages/Templates
// surface is scoped in Design/PRD.md — v1 here is a roll-up of the
// structured fields already captured on each company (HM, recruiter,
// referrer) so the tab is useful immediately without waiting for the
// full CRM build-out.
export default function Network({ companies }) {
  const rows = useMemo(() => {
    const out = [];
    companies.forEach((c) => {
      if (c.hmName) {
        out.push({
          id: `${c.id}-hm`,
          companyId: c.id,
          company: c.name,
          role: c.role,
          personName: c.hmName,
          personRole: 'Hiring Manager',
          meta: c.hmContactedDirectly ? 'Contacted directly' : '',
          channel: c.channel || '',
        });
      }
      if (c.recruiterName) {
        out.push({
          id: `${c.id}-rec`,
          companyId: c.id,
          company: c.name,
          role: c.role,
          personName: c.recruiterName,
          personRole: 'Recruiter',
          meta: c.recruiterCompany || '',
          channel: c.channel || '',
        });
      }
      if (c.referralName) {
        out.push({
          id: `${c.id}-ref`,
          companyId: c.id,
          company: c.name,
          role: c.role,
          personName: c.referralName,
          personRole: 'Referral',
          meta: c.referralRelationship || '',
          channel: c.channel || '',
        });
      }
    });
    return out;
  }, [companies]);

  const sectionTitle = {
    fontSize: 11,
    fontWeight: 600,
    color: C.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 14,
        }}
      >
        <div style={sectionTitle}>Network — {rows.length} contact{rows.length === 1 ? '' : 's'}</div>
        <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>
          Full CRM (contacts, messages, templates) — coming soon
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px 0',
            color: C.textMuted,
            fontSize: 13,
            fontStyle: 'italic',
          }}
        >
          No contacts yet. Add hiring managers, recruiters, or referrals inside a company's detail screen.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr 0.9fr 1.4fr 0.8fr',
              padding: '0 12px 6px',
              fontSize: 10,
              fontWeight: 600,
              color: C.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}
          >
            <span>Contact</span>
            <span>Role</span>
            <span>Company</span>
            <span>Detail</span>
            <span>Channel</span>
          </div>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.2fr 1fr 0.9fr 1.4fr 0.8fr',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 6,
                background: C.card,
                border: `1px solid ${C.border}`,
                fontSize: 13,
                alignItems: 'center',
              }}
            >
              <span style={{ color: C.text, fontWeight: 600 }}>{r.personName}</span>
              <span style={{ color: C.accent, fontSize: 12 }}>{r.personRole}</span>
              <span style={{ color: C.textDim, fontSize: 12 }}>
                {r.company}
                {r.role ? (
                  <span style={{ color: C.textMuted }}> · {r.role}</span>
                ) : null}
              </span>
              <span style={{ color: C.textDim, fontSize: 12, fontStyle: r.meta ? 'normal' : 'italic' }}>
                {r.meta || '—'}
              </span>
              <span style={{ color: C.textMuted, fontSize: 11 }}>{r.channel || '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
