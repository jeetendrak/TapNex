import type { PublicProfileRecord } from '../types';

function escapeVCard(val?: string): string {
  if (!val) return '';
  return val
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

export function buildPublicVCard(profile: PublicProfileRecord, publicUrl: string): string {
  const info = profile.personalInformation || {};
  const fullName = info.fullName || profile.slug;
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${escapeVCard(fullName)}`,
    `N:${escapeVCard(lastName)};${escapeVCard(firstName)};;;`,
  ];

  if (info.companyName) lines.push(`ORG:${escapeVCard(info.companyName)}`);
  if (info.jobTitle) lines.push(`TITLE:${escapeVCard(info.jobTitle)}`);
  if (info.mobile) lines.push(`TEL;TYPE=CELL,VOICE:${info.mobile}`);
  if (info.whatsapp && info.whatsapp !== info.mobile) lines.push(`TEL;TYPE=CELL:${info.whatsapp}`);
  if (info.alternateMobile) lines.push(`TEL;TYPE=WORK,VOICE:${info.alternateMobile}`);
  if (info.email) lines.push(`EMAIL;TYPE=PREF,INTERNET:${info.email}`);
  if (info.alternateEmail) lines.push(`EMAIL;TYPE=INTERNET:${info.alternateEmail}`);
  if (info.website) lines.push(`URL:${info.website}`);
  lines.push(`URL;TYPE=DigitalProfile:${publicUrl}`);

  if (info.businessAddress || info.city || info.state || info.pinCode || info.country) {
    lines.push(
      `ADR;TYPE=WORK:;;${escapeVCard(info.businessAddress)};${escapeVCard(info.city)};${escapeVCard(info.state)};${escapeVCard(info.pinCode)};${escapeVCard(info.country || 'India')}`
    );
  }

  if (info.personalAddress) {
    lines.push(`ADR;TYPE=HOME:;;${escapeVCard(info.personalAddress)};;;;`);
  }

  if (info.shortBio) {
    lines.push(`NOTE:${escapeVCard(info.shortBio)}`);
  }

  lines.push('END:VCARD');
  return lines.join('\r\n');
}

export function downloadVCard(profile: PublicProfileRecord, publicUrl: string): void {
  const vcfContent = buildPublicVCard(profile, publicUrl);
  const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${profile.slug || 'contact'}.vcf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
