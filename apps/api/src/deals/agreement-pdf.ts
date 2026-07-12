import { createElement as h } from 'react';
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { leaseEndDate } from '@guri/shared';

// One bilingual template (§6): Somali and English side by side, printing the
// exact fields the lease will carry so the paper and the app never disagree
// (§16). Rendered with @react-pdf/renderer — no headless Chrome.

export interface AgreementData {
  agencyName: string;
  agencyPhone: string;
  customerName: string;
  customerPhone: string;
  ownerName: string;
  district: string;
  neighborhood: string | null;
  type: string;
  bedrooms: number;
  rentUsd: number;
  depositUsd: number;
  startDate: Date | null;
  termMonths: number | null;
  generatedAt: Date;
}

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: 'Helvetica', color: '#173A31' },
  heading: { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  subheading: { fontSize: 11, color: '#5C6B64', marginBottom: 18 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: '#B7F35D',
  },
  row: { flexDirection: 'row', marginBottom: 4 },
  labelSo: { width: '30%', color: '#5C6B64' },
  labelEn: { width: '30%', color: '#5C6B64', fontStyle: 'italic' },
  value: { width: '40%', fontFamily: 'Helvetica-Bold' },
  signatures: { flexDirection: 'row', marginTop: 40, justifyContent: 'space-between' },
  sigBox: { width: '30%', borderTopWidth: 1, borderTopColor: '#173A31', paddingTop: 4 },
  sigLabel: { fontSize: 8, color: '#5C6B64' },
  footer: { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#5C6B64' },
});

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '—');
const fmtUsd = (n: number) => `$${Math.round(n)} USD`;

function row(labelSo: string, labelEn: string, value: string) {
  return h(View, { style: styles.row, key: labelEn }, [
    h(Text, { style: styles.labelSo, key: 'so' }, labelSo),
    h(Text, { style: styles.labelEn, key: 'en' }, labelEn),
    h(Text, { style: styles.value, key: 'v' }, value),
  ]);
}

function section(titleSoEn: string, rows: ReturnType<typeof row>[]) {
  return h(View, { style: styles.section, key: titleSoEn }, [
    h(Text, { style: styles.sectionTitle, key: 't' }, titleSoEn),
    ...rows,
  ]);
}

export async function renderAgreementPdf(data: AgreementData): Promise<Buffer> {
  const endDate =
    data.startDate && data.termMonths ? leaseEndDate(data.startDate, data.termMonths) : null;

  const doc = h(
    Document,
    { title: 'Guri — Heshiis kiro / Rental agreement' },
    h(Page, { size: 'A4', style: styles.page }, [
      h(Text, { style: styles.heading, key: 'h' }, 'Heshiis kiro · Rental agreement'),
      h(
        Text,
        { style: styles.subheading, key: 's' },
        `Guri · Muqdisho / Mogadishu · ${fmtDate(data.generatedAt)}`,
      ),

      section('Dhinacyada · Parties', [
        row('Kiraystaha', 'Tenant', `${data.customerName} · ${data.customerPhone}`),
        row('Mulkiilaha', 'Owner', data.ownerName),
        row('Wakaaladda', 'Agency', `${data.agencyName} · ${data.agencyPhone}`),
      ]),

      section('Guriga · The property', [
        row('Degmada', 'District', data.district),
        row('Xaafadda', 'Neighborhood', data.neighborhood ?? '—'),
        row('Nooca', 'Type', data.type),
        row('Qolalka jiifka', 'Bedrooms', String(data.bedrooms)),
      ]),

      section('Lacagta · Money', [
        row('Kirada bishii', 'Monthly rent', fmtUsd(data.rentUsd)),
        row('Dammaanadda', 'Deposit', fmtUsd(data.depositUsd)),
      ]),

      section('Muddada · Term', [
        row('Taariikhda bilowga', 'Start date', fmtDate(data.startDate)),
        row('Muddada (bilo)', 'Term (months)', data.termMonths ? String(data.termMonths) : '—'),
        row('Taariikhda dhammaadka', 'End date', fmtDate(endDate)),
      ]),

      h(View, { style: styles.signatures, key: 'sig' }, [
        h(View, { style: styles.sigBox, key: '1' }, [
          h(Text, { style: styles.sigLabel, key: 'l' }, 'Kiraystaha · Tenant'),
        ]),
        h(View, { style: styles.sigBox, key: '2' }, [
          h(Text, { style: styles.sigLabel, key: 'l' }, 'Mulkiilaha · Owner'),
        ]),
        h(View, { style: styles.sigBox, key: '3' }, [
          h(Text, { style: styles.sigLabel, key: 'l' }, 'Wakaaladda · Agency'),
        ]),
      ]),

      h(
        Text,
        { style: styles.footer, key: 'f' },
        'Lacag kasta waa USD; lacagaha waxaa diiwaangelisa wakaaladda — Guri ma dhaqaajiso lacag. ' +
          'All amounts in USD; payments are recorded by the agency — Guri moves no money.',
      ),
    ]),
  );

  return renderToBuffer(doc);
}
