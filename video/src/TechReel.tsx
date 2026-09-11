import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { AMBER, FOREST, INK, LIME, MIST, MUTED, SLATE, display, mono, sans } from './brand';

// Technical case-study cut of Guri. Every number and snippet below is taken
// from the repo (SPEC.md, SECURITY.md, apps/api, packages/shared).

const SCENES = [
  { name: 'title', len: 90 },
  { name: 'stats', len: 150 },
  { name: 'arch', len: 210 },
  { name: 'machine', len: 240 },
  { name: 'code', len: 240 },
  { name: 'security', len: 240 },
  { name: 'lease', len: 180 },
  { name: 'ci', len: 180 },
  { name: 'outro', len: 150 },
] as const;

export const TECH_DURATION = SCENES.reduce((s, x) => s + x.len, 0);

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const useSpring = (delay = 0, damping = 16) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

const SceneFrame: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, len - 10, len], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ backgroundColor: FOREST, fontFamily: sans, color: MIST }}>
      {/* faint blueprint grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(183,243,93,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(183,243,93,0.05) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

const Rise: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  style,
}) => {
  const p = useSpring(delay, 18);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 30}px)`, ...style }}>{children}</div>;
};

const Heading: React.FC<{ kicker: string; title: string }> = ({ kicker, title }) => (
  <div style={{ position: 'absolute', left: 120, top: 70 }}>
    <Rise>
      <div style={{ fontFamily: mono, fontSize: 26, color: LIME, letterSpacing: 1 }}>{kicker}</div>
    </Rise>
    <Rise delay={6}>
      <div style={{ fontFamily: display, fontSize: 72, fontWeight: 800, letterSpacing: -2, marginTop: 8 }}>{title}</div>
    </Rise>
  </div>
);

const Tick: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size,
      background: LIME,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={FOREST} strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/* ---------- tiny TS syntax highlighter ---------- */

const TOKEN = /(\/\/.*$)|('[^']*')|\b(async|await|const|if|throw|new|return|export|function)\b|\b([A-Z]\w*)\b|(\w+)(?=\()/g;

const highlight = (line: string) => {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const color = m[1] ? '#6F8A7F' : m[2] ? AMBER : m[3] ? LIME : m[4] ? '#8FD9C0' : '#E8F5D0';
    out.push(
      <span key={m.index} style={{ color, fontStyle: m[1] ? 'italic' : 'normal' }}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  out.push(line.slice(last));
  return out;
};

const CodePanel: React.FC<{
  file: string;
  lines: string[];
  start: number;
  charsPerFrame?: number;
  fontSize?: number;
  highlightLines?: { from: number; to: number; at: number }[];
  style?: React.CSSProperties;
}> = ({ file, lines, start, charsPerFrame = 3, fontSize = 26, highlightLines = [], style }) => {
  const frame = useCurrentFrame();
  let budget = Math.max(0, (frame - start) * charsPerFrame);
  return (
    <div style={{ background: INK, borderRadius: 24, border: '1px solid rgba(183,243,93,0.18)', overflow: 'hidden', ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 24px', borderBottom: '1px solid rgba(244,247,242,0.08)' }}>
        {['#E5695B', AMBER, LIME].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 14, background: c, opacity: 0.8 }} />
        ))}
        <div style={{ fontFamily: mono, fontSize: 20, color: MUTED, marginLeft: 12 }}>{file}</div>
      </div>
      <div style={{ padding: '20px 0', fontFamily: mono, fontSize, lineHeight: 1.55 }}>
        {lines.map((line, i) => {
          const shown = line.slice(0, Math.max(0, budget));
          budget -= line.length + 1;
          const hl = highlightLines.find((h) => i >= h.from && i <= h.to);
          const hlOpacity = hl ? interpolate(frame, [hl.at, hl.at + 8], [0, 1], clamp) : 0;
          return (
            <div key={i} style={{ display: 'flex', whiteSpace: 'pre', background: `rgba(183,243,93,${0.12 * hlOpacity})`, borderLeft: `4px solid rgba(183,243,93,${hlOpacity})`, boxSizing: 'border-box' }}>
              <span style={{ width: 64, textAlign: 'right', paddingRight: 20, color: '#3F5A50' }}>{i + 1}</span>
              <span style={{ color: MIST }}>{highlight(shown)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ---------------- Scenes ---------------- */

const Title: React.FC = () => {
  const icon = useSpring(0, 12);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Img src={staticFile('icon.png')} style={{ width: 150, height: 150, borderRadius: 36, transform: `scale(${icon})` }} />
      <Rise delay={10}>
        <div style={{ fontFamily: display, fontSize: 150, fontWeight: 800, letterSpacing: -5, marginTop: 30, lineHeight: 1 }}>Guri</div>
      </Rise>
      <Rise delay={20}>
        <div style={{ fontSize: 40, color: MUTED, marginTop: 20 }}>A production rental marketplace for Mogadishu</div>
      </Rise>
      <Rise delay={32}>
        <div style={{ fontFamily: mono, fontSize: 28, color: LIME, marginTop: 36 }}>// full-stack case study</div>
      </Rise>
    </AbsoluteFill>
  );
};

const STATS = [
  { v: 21100, suffix: '', label: 'lines of TypeScript', fmt: true },
  { v: 104, suffix: '', label: 'API tests · 18 suites' },
  { v: 16, suffix: '', label: 'Prisma models · 11 migrations' },
  { v: 5, suffix: '', label: 'roles, one sign-in' },
  { v: 12, suffix: '', label: 'deal states in the machine' },
  { v: 2, suffix: '', label: 'languages · Somali + English' },
];

const Stats: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Heading kicker="$ git ls-files | wc" title="Designed, built and shipped to production." />
      <div style={{ position: 'absolute', left: 120, right: 120, top: 330, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 28 }}>
        {STATS.map((s, i) => {
          const t = interpolate(frame, [20 + i * 5, 65 + i * 5], [0, 1], clamp);
          const v = Math.round(s.v * (1 - Math.pow(1 - t, 3)));
          return (
            <Rise key={s.label} delay={12 + i * 5}>
              <div style={{ background: 'rgba(244,247,242,0.06)', border: '1px solid rgba(244,247,242,0.12)', borderRadius: 28, padding: '34px 40px' }}>
                <div style={{ fontFamily: display, fontSize: 104, fontWeight: 800, color: i === 0 ? LIME : MIST, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                  {s.fmt ? v.toLocaleString('en-US') : v}
                </div>
                <div style={{ fontSize: 30, color: MUTED, marginTop: 14 }}>{s.label}</div>
              </div>
            </Rise>
          );
        })}
      </div>
      <Rise delay={70} style={{ position: 'absolute', left: 120, bottom: 70 }}>
        <div style={{ fontFamily: mono, fontSize: 26, color: MUTED }}>
          live at <span style={{ color: LIME }}>getguri.com</span> · pnpm monorepo · CI-gated deploys on Railway
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

type Box = { id: string; x: number; y: number; w: number; h: number; title: string; lines: string[]; accent?: boolean; delay: number };

const BOXES: Box[] = [
  { id: 'web', x: 120, y: 330, w: 500, h: 290, title: 'apps/web', lines: ['Next.js App Router', 'Tailwind + shadcn/ui', 'next-intl (so / en)', 'Serwist PWA · offline'], delay: 10 },
  { id: 'api', x: 760, y: 330, w: 500, h: 290, title: 'apps/api', lines: ['NestJS · one container', 'Prisma ORM', 'pg-boss worker', '@nestjs/schedule cron'], accent: true, delay: 22 },
  { id: 'pg', x: 1400, y: 250, w: 400, h: 130, title: 'PostgreSQL', lines: ['16 models · audit log'], delay: 34 },
  { id: 'r2', x: 1400, y: 410, w: 400, h: 130, title: 'Cloudflare R2', lines: ['S3 API · encrypted at rest'], delay: 40 },
  { id: 'clerk', x: 1400, y: 570, w: 400, h: 130, title: 'Clerk', lines: ['Google + email · JWKS'], delay: 46 },
  { id: 'shared', x: 440, y: 790, w: 500, h: 170, title: 'packages/shared', lines: ['zod schemas', 'deal / lease / intake transition tables'], accent: true, delay: 58 },
];

const EDGES: { d: string; label: string; lx: number; ly: number; delay: number }[] = [
  { d: 'M620 470 L760 470', label: 'REST + JWT', lx: 690, ly: 452, delay: 30 },
  { d: 'M1260 400 L1400 315', label: '', lx: 0, ly: 0, delay: 40 },
  { d: 'M1260 475 L1400 475', label: 'presign', lx: 1330, ly: 457, delay: 46 },
  { d: 'M1400 635 L1260 560', label: 'Svix webhook', lx: 1320, ly: 680, delay: 52 },
  { d: 'M600 790 L470 620', label: 'import', lx: 470, ly: 720, delay: 66 },
  { d: 'M780 790 L910 620', label: 'import', lx: 910, ly: 720, delay: 66 },
];

const Arch: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = (frame % 45) / 45;
  return (
    <AbsoluteFill>
      <Heading kicker="architecture" title="One monorepo. One source of truth." />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        {EDGES.map((e, i) => {
          const p = interpolate(frame, [e.delay, e.delay + 18], [0, 1], clamp);
          return (
            <g key={i}>
              <path d={e.d} stroke={LIME} strokeWidth={3} fill="none" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - p} opacity={0.7} />
              {p >= 1 && (() => {
                // frame-driven packet along the straight edge (animateMotion isn't deterministic in renders)
                const [x1, y1, x2, y2] = (e.d.match(/-?\d+/g) ?? []).map(Number);
                const k = (pulse + i * 0.17) % 1;
                return <circle cx={x1 + (x2 - x1) * k} cy={y1 + (y2 - y1) * k} r={6} fill={LIME} />;
              })()}
              {e.label && (
                <text x={e.lx} y={e.ly} fill={MUTED} fontFamily={mono} fontSize={19} textAnchor="middle" opacity={p}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {BOXES.map((b) => (
        <ArchBox key={b.id} b={b} />
      ))}
    </AbsoluteFill>
  );
};

const ArchBox: React.FC<{ b: Box }> = ({ b }) => {
  const p = useSpring(b.delay, 15);
  return (
    <div
      style={{
        position: 'absolute',
        left: b.x,
        top: b.y,
        width: b.w,
        height: b.h,
        borderRadius: 24,
        background: b.accent ? 'rgba(183,243,93,0.1)' : 'rgba(244,247,242,0.06)',
        border: `2px solid ${b.accent ? LIME : 'rgba(244,247,242,0.2)'}`,
        padding: '22px 28px',
        boxSizing: 'border-box',
        opacity: p,
        transform: `scale(${0.85 + p * 0.15})`,
      }}
    >
      <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700, color: b.accent ? LIME : MIST }}>{b.title}</div>
      {b.lines.map((l) => (
        <div key={l} style={{ fontSize: 25, color: MUTED, marginTop: 8 }}>
          {l}
        </div>
      ))}
    </div>
  );
};

// ---------- deal state machine ----------

const MAIN = ['requested', 'viewing_scheduled', 'awaiting_docs', 'docs_in_review', 'approved', 'closed'];
const MX = (i: number) => 230 + i * 292;
const MY = 520;

const TERMINALS: { label: string; x: number; from: number; back?: boolean }[] = [
  { label: 'expired', x: 140, from: 0 },
  { label: 'declined_by_agency', x: 400, from: 0 },
  { label: 'no_show', x: 650, from: 1 },
  { label: 'declined', x: 850, from: 1 },
  { label: 'docs_rejected', x: MX(3), from: 3, back: true },
];

const Machine: React.FC = () => {
  const frame = useCurrentFrame();
  const START = 40;
  const STEP = 26;
  const pos = interpolate(frame, [START, START + STEP * 5], [0, 5], clamp);
  const tokenX = interpolate(pos, [0, 5], [MX(0), MX(5)]);
  const draw = interpolate(frame, [15, 45], [0, 1], clamp);
  const termP = interpolate(frame, [170, 195], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Heading kicker="packages/shared/src/transitions/deal.ts" title="Deals are a finite-state machine." />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={LIME} />
          </marker>
          <marker id="arrM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={MUTED} />
          </marker>
        </defs>
        {/* withdraw rail: any open state */}
        <g opacity={termP}>
          <path d={`M${MX(0)} ${MY - 50} L${MX(0)} 360 L${MX(4)} 360 L${MX(4)} ${MY - 50}`} stroke={MUTED} strokeWidth={2} strokeDasharray="8 8" fill="none" />
          {[1, 2, 3].map((i) => (
            <line key={i} x1={MX(i)} y1={360} x2={MX(i)} y2={MY - 50} stroke={MUTED} strokeWidth={2} strokeDasharray="8 8" />
          ))}
          <rect x={MX(2) + 70} y={338} width={250} height={44} rx={22} fill={FOREST} stroke={MUTED} strokeWidth={2} />
          <text x={MX(2) + 195} y={367} fill={MIST} fontFamily={mono} fontSize={22} textAnchor="middle">
            withdrawn
          </text>
        </g>
        {/* main edges */}
        {MAIN.slice(0, -1).map((_, i) => (
          <line
            key={i}
            x1={MX(i) + 58}
            y1={MY}
            x2={MX(i) + 58 + (292 - 116) * draw}
            y2={MY}
            stroke={LIME}
            strokeWidth={3}
            markerEnd={draw > 0.95 ? 'url(#arr)' : undefined}
            opacity={0.8}
          />
        ))}
        {/* terminal branches */}
        {TERMINALS.map((t) => (
          <g key={t.label} opacity={termP}>
            <path d={`M${MX(t.from)} ${MY + 50} L${t.x} ${MY + 175}`} stroke={MUTED} strokeWidth={2} fill="none" markerEnd="url(#arrM)" />
            <rect x={t.x - (t.label.length * 7 + 26)} y={MY + 180} width={t.label.length * 14 + 52} height={46} rx={23} fill={INK} stroke="rgba(244,247,242,0.3)" strokeWidth={2} />
            <text x={t.x} y={MY + 210} fill={MUTED} fontFamily={mono} fontSize={22} textAnchor="middle">
              {t.label}
            </text>
            {t.back && (
              <path d={`M${t.x + 90} ${MY + 185} Q ${MX(3) + 150} ${MY + 90} ${MX(3) + 50} ${MY + 38}`} stroke={AMBER} strokeWidth={2.5} strokeDasharray="6 6" fill="none" markerEnd="url(#arrM)" />
            )}
          </g>
        ))}
        {termP > 0 && (
          <text x={MX(3) + 190} y={MY + 120} fill={AMBER} fontFamily={mono} fontSize={20} opacity={termP}>
            resubmit
          </text>
        )}
        {/* nodes */}
        {MAIN.map((s, i) => {
          const reached = pos >= i - 0.02;
          const nodeP = spring({ frame: frame - 8 - i * 4, fps: 30, config: { damping: 14 } });
          return (
            <g key={s} transform={`translate(${MX(i)} ${MY}) scale(${nodeP})`}>
              <circle r={50} fill={reached ? (i === 5 ? LIME : 'rgba(183,243,93,0.18)') : INK} stroke={LIME} strokeWidth={reached ? 4 : 2} />
              <text y={10} fill={i === 5 && reached ? FOREST : MIST} fontFamily={display} fontSize={30} fontWeight={800} textAnchor="middle">
                {i + 1}
              </text>
              <text y={92} fill={reached ? MIST : MUTED} fontFamily={mono} fontSize={21} textAnchor="middle">
                {s}
              </text>
            </g>
          );
        })}
        {/* moving deal token */}
        {frame >= START && frame < START + STEP * 5 + 10 && <circle cx={tokenX} cy={MY} r={16} fill={LIME} opacity={0.95} />}
      </svg>
      <Rise delay={200} style={{ position: 'absolute', left: 120, bottom: 70 }}>
        <div style={{ fontSize: 30, color: MUTED }}>
          <span style={{ color: LIME, fontWeight: 700 }}>20 transitions</span> · validated server-side · the same table renders the UI's available actions
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

// ---------- real code ----------

const TRANSITION_CODE = [
  '// Generic transition: validates against the §4 table, writes the',
  '// deal_events row, recomputes derived listing status.',
  'async transition(dealId, action, actorId, note?, dealData?) {',
  '  const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });',
  "  if (!deal) throw new NotFoundException('deal_not_found');",
  '',
  '  const t = findDealTransition(deal.state, action);',
  "  if (!t) throw new ConflictException('invalid_transition');",
  '',
  '  const updated = await this.prisma.$transaction(async (tx) => {',
  '    const u = await tx.deal.update({ where: { id: deal.id },',
  '                                     data: { state: t.to } });',
  '    await tx.dealEvent.create({ data: { dealId: deal.id, fromState: deal.state,',
  '                                        toState: t.to, actorId, note } });',
  '    return u;',
  '  });',
  '',
  '  await this.listings.recomputeStatus(deal.listingId);',
  '  return updated;',
  '}',
];

const CALLOUTS = [
  { n: 1, at: 95, title: 'Single choke point', body: 'No controller writes deals.state directly.' },
  { n: 2, at: 130, title: 'Atomic + auditable', body: 'State change and deal_events row commit in one transaction.' },
  { n: 3, at: 165, title: 'Derived, never written', body: 'Listing status is computed: live lease → rented, reserving deal → reserved.' },
];

const Code: React.FC = () => (
  <AbsoluteFill>
    <Heading kicker="apps/api/src/deals/deal-state.service.ts" title="Rules enforced in code, not convention." />
    <CodePanel
      file="deal-state.service.ts"
      lines={TRANSITION_CODE}
      start={12}
      charsPerFrame={14}
      fontSize={22}
      highlightLines={[
        { from: 6, to: 7, at: 95 },
        { from: 9, to: 15, at: 130 },
        { from: 17, to: 17, at: 165 },
      ]}
      style={{ position: 'absolute', left: 120, top: 270, width: 1170 }}
    />
    <div style={{ position: 'absolute', left: 1340, top: 290, width: 460, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {CALLOUTS.map((c) => (
        <Rise key={c.n} delay={c.at}>
          <div style={{ display: 'flex', gap: 18, background: 'rgba(244,247,242,0.06)', borderRadius: 22, padding: '24px 26px', border: '1px solid rgba(183,243,93,0.25)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 44, background: LIME, color: FOREST, fontFamily: display, fontWeight: 800, fontSize: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {c.n}
            </div>
            <div>
              <div style={{ fontFamily: display, fontSize: 32, fontWeight: 700 }}>{c.title}</div>
              <div style={{ fontSize: 23, color: MUTED, marginTop: 6, lineHeight: 1.4 }}>{c.body}</div>
            </div>
          </div>
        </Rise>
      ))}
    </div>
  </AbsoluteFill>
);

// ---------- security ----------

const GUARDS = [
  { name: 'GuriThrottlerGuard', note: 'per-user / per-IP rate limits' },
  { name: 'ClerkAuthGuard', note: 'verify JWT against Clerk JWKS (jose)' },
  { name: 'AgencyGuard', note: 'object scoped to caller’s agency' },
  { name: "@AgencyRoles('agent')", note: 'staff role check' },
  { name: 'can_verify', note: 'permission, not a separate role' },
  { name: 'AuditService.log()', note: 'append-only · the only write path' },
];

const Security: React.FC = () => {
  const frame = useCurrentFrame();
  const ttl = Math.max(0, 300 - Math.floor(interpolate(frame, [120, 235], [0, 299], clamp)));
  const mm = Math.floor(ttl / 60);
  const ss = String(ttl % 60).padStart(2, '0');
  const reqY = interpolate(frame, [25, 25 + GUARDS.length * 14], [0, GUARDS.length], clamp);
  return (
    <AbsoluteFill>
      <Heading kicker="SECURITY.md · security-pass.spec.ts" title="Defense in depth, proven by tests." />
      <div style={{ position: 'absolute', left: 120, top: 270, width: 900 }}>
        <div style={{ fontFamily: mono, fontSize: 24, color: MUTED, marginBottom: 16 }}>POST /deals/:id/verify</div>
        {GUARDS.map((g, i) => {
          const passed = reqY > i + 0.5;
          return (
            <Rise key={g.name} delay={10 + i * 5}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  padding: '16px 24px',
                  marginBottom: 12,
                  borderRadius: 18,
                  background: passed ? 'rgba(183,243,93,0.12)' : 'rgba(244,247,242,0.05)',
                  border: `2px solid ${passed ? LIME : 'rgba(244,247,242,0.14)'}`,
                }}
              >
                {passed ? <Tick size={34} /> : <div style={{ width: 34, height: 34, borderRadius: 34, border: '2px solid rgba(244,247,242,0.3)' }} />}
                <div style={{ fontFamily: mono, fontSize: 27, fontWeight: 700, color: passed ? LIME : MIST, width: 360, flexShrink: 0 }}>{g.name}</div>
                <div style={{ fontSize: 22, color: MUTED, whiteSpace: 'nowrap' }}>{g.note}</div>
              </div>
            </Rise>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 1080, top: 300, width: 720 }}>
        <Rise delay={110}>
          <div style={{ background: INK, borderRadius: 28, padding: '36px 40px', border: '1px solid rgba(183,243,93,0.25)' }}>
            <div style={{ fontFamily: display, fontSize: 36, fontWeight: 700 }}>ID documents</div>
            <div style={{ fontSize: 24, color: MUTED, marginTop: 8, lineHeight: 1.45 }}>
              Encrypted at rest. Never a static URL. Served only via a presigned GET after a role check.
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 26 }}>
              <div style={{ fontFamily: mono, fontSize: 88, fontWeight: 700, color: LIME, fontVariantNumeric: 'tabular-nums' }}>
                {mm}:{ss}
              </div>
              <div style={{ fontFamily: mono, fontSize: 22, color: MUTED }}>DOCUMENT_URL_TTL_SECONDS = 300</div>
            </div>
            <div style={{ fontFamily: mono, fontSize: 21, color: MIST, marginTop: 18, background: 'rgba(244,247,242,0.06)', borderRadius: 14, padding: '14px 18px' }}>
              <span style={{ color: AMBER }}>audit_log</span> ← document.url_issued {'{'} role, ttl {'}'}
            </div>
          </div>
        </Rise>
        <Rise delay={150}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26 }}>
            {['pino log redaction', 'Svix-signed webhooks', 'sharp re-encode', '90-day doc retention', 'public-route allowlist test'].map((c) => (
              <div key={c} style={{ fontSize: 22, padding: '10px 20px', borderRadius: 999, border: '1px solid rgba(244,247,242,0.22)', color: MIST }}>
                {c}
              </div>
            ))}
          </div>
        </Rise>
      </div>
    </AbsoluteFill>
  );
};

// ---------- lease lifecycle ----------

const Lease: React.FC = () => {
  const frame = useCurrentFrame();
  const loop = (frame % 40) / 40;
  const node = (x: number, y: number, label: string, sub: string, delay: number, accent = false) => {
    const p = spring({ frame: frame - delay, fps: 30, config: { damping: 14 } });
    return (
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 320,
          padding: '22px 26px',
          borderRadius: 24,
          boxSizing: 'border-box',
          background: accent ? LIME : 'rgba(244,247,242,0.06)',
          border: accent ? 'none' : '2px solid rgba(244,247,242,0.2)',
          color: accent ? FOREST : MIST,
          opacity: p,
          transform: `scale(${0.85 + 0.15 * p})`,
        }}
      >
        <div style={{ fontFamily: mono, fontSize: 30, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 22, marginTop: 6, color: accent ? FOREST : MUTED }}>{sub}</div>
      </div>
    );
  };
  const edge = interpolate(frame, [30, 60], [0, 1], clamp);
  return (
    <AbsoluteFill>
      <Heading kicker="SPEC §16 · lease lifecycle" title="Timers nudge. They never evict." />
      <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
        <g stroke={LIME} strokeWidth={3} fill="none" opacity={edge}>
          <path d="M440 520 L560 520" />
          <path d="M880 490 L1020 390" />
          <path d="M880 550 L1020 650" />
        </g>
        <path d="M660 450 C 620 330, 800 330, 760 450" stroke={AMBER} strokeWidth={3} fill="none" strokeDasharray="8 8" strokeDashoffset={-loop * 32} opacity={edge} />
        <text x={710} y={320} fill={AMBER} fontFamily={mono} fontSize={21} textAnchor="middle" opacity={edge}>
          grace window · nudge daily
        </text>
        <text x={500} y={500} fill={MUTED} fontFamily={mono} fontSize={18} textAnchor="middle" opacity={edge}>
          T−30d
        </text>
      </svg>
      {node(120, 460, 'active', 'term set at close', 10)}
      {node(560, 460, 'ending_soon', 'tenant, agency, owner told', 30)}
      {node(1020, 310, 'renewed', 'new lease, linked history', 60, true)}
      {node(1020, 590, 'vacated', 'listing → available', 70)}
      <Rise delay={90} style={{ position: 'absolute', left: 1420, top: 330, width: 400 }}>
        <div style={{ fontSize: 26, color: MUTED, lineHeight: 1.5 }}>
          Only a <span style={{ color: LIME, fontWeight: 700 }}>human</span> records renew or move-out. One live lease per listing, enforced by the API. Leaving the platform is blocked while a lease is live.
        </div>
      </Rise>
      <Rise delay={110} style={{ position: 'absolute', left: 120, bottom: 70 }}>
        <div style={{ fontFamily: mono, fontSize: 24, color: MUTED }}>
          pg-boss runner every 15 min · 14d request expiry · 72h viewing nudge · 48h verifier reminder · nightly offsite backup
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

// ---------- CI / CD ----------

const PIPE = ['git push main', 'pnpm install --frozen-lockfile', 'pnpm -r build', '104 API tests', 'Railway · Wait for CI', 'getguri.com'];

const SUITES = [
  'security-pass', 'deals-verification', 'deals-closing', 'deals-rules', 'deals-agency', 'listings-rules',
  'owner-rules', 'intakes', 'jobs-timers', 'rate-limit', 'logging-redaction', 'image-hardening',
  'clerk-auth', 'backup-restore', 'agency-applications', 'health', 'phase8', 'phase85',
];

const CI: React.FC = () => {
  const frame = useCurrentFrame();
  const stage = interpolate(frame, [20, 110], [0, PIPE.length], clamp);
  return (
    <AbsoluteFill>
      <Heading kicker=".github/workflows/ci.yml" title="No green CI, no deploy." />
      <div style={{ position: 'absolute', left: 120, right: 120, top: 280, display: 'flex', alignItems: 'center', gap: 14 }}>
        {PIPE.map((p, i) => {
          const on = stage > i;
          return (
            <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 14, flex: i === 1 ? 1.5 : 1 }}>
              <div
                style={{
                  flex: 1,
                  padding: '20px 18px',
                  borderRadius: 18,
                  textAlign: 'center',
                  fontFamily: mono,
                  fontSize: 21,
                  background: on ? (i === PIPE.length - 1 ? LIME : 'rgba(183,243,93,0.14)') : 'rgba(244,247,242,0.05)',
                  color: on ? (i === PIPE.length - 1 ? FOREST : LIME) : MUTED,
                  border: `2px solid ${on ? LIME : 'rgba(244,247,242,0.15)'}`,
                  fontWeight: 700,
                }}
              >
                {p}
              </div>
              {i < PIPE.length - 1 && <div style={{ color: on ? LIME : '#3F5A50', fontSize: 30 }}>→</div>}
            </div>
          );
        })}
      </div>
      <div style={{ position: 'absolute', left: 120, right: 120, top: 460, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px 28px' }}>
        {SUITES.map((s, i) => {
          const on = frame > 55 + i * 3;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: mono, fontSize: 25, color: on ? MIST : '#3F5A50' }}>
              {on ? <Tick size={28} /> : <div style={{ width: 28, height: 28, borderRadius: 28, border: '2px solid #3F5A50' }} />}
              {s}.spec.ts
            </div>
          );
        })}
      </div>
      <Rise delay={120} style={{ position: 'absolute', left: 120, bottom: 70 }}>
        <div style={{ fontSize: 28, color: MUTED }}>
          Any new route that skips auth <span style={{ color: LIME, fontWeight: 700 }}>fails the build</span> — an allowlist test guards the public surface.
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

const STACK = ['TypeScript', 'Next.js', 'React', 'NestJS', 'Prisma', 'PostgreSQL', 'pg-boss', 'zod', 'Clerk', 'Cloudflare R2', 'Tailwind', 'PWA', 'GitHub Actions', 'Railway'];

const Outro: React.FC = () => (
  <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Rise>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30 }}>
        <Img src={staticFile('icon.png')} style={{ width: 130, height: 130, borderRadius: 30 }} />
        <div style={{ fontFamily: display, fontSize: 130, fontWeight: 800, letterSpacing: -4 }}>Guri</div>
      </div>
    </Rise>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 14, width: 1400, marginTop: 50 }}>
      {STACK.map((s, i) => (
        <Rise key={s} delay={12 + i * 2}>
          <div style={{ fontSize: 28, padding: '12px 26px', borderRadius: 999, border: `2px solid ${i % 4 === 0 ? LIME : 'rgba(244,247,242,0.22)'}`, color: i % 4 === 0 ? LIME : MIST }}>
            {s}
          </div>
        </Rise>
      ))}
    </div>
    <Rise delay={50}>
      <div style={{ fontFamily: mono, fontSize: 34, marginTop: 60, color: MIST }}>
        <span style={{ color: LIME }}>getguri.com</span> · github.com/bashiir-code/guri
      </div>
    </Rise>
  </AbsoluteFill>
);

const RENDER: Record<(typeof SCENES)[number]['name'], React.FC> = {
  title: Title,
  stats: Stats,
  arch: Arch,
  machine: Machine,
  code: Code,
  security: Security,
  lease: Lease,
  ci: CI,
  outro: Outro,
};

export const GuriTechReel: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: FOREST }}>
      {SCENES.map((s) => {
        const start = from;
        from += s.len;
        const C = RENDER[s.name];
        return (
          <Sequence key={s.name} from={start} durationInFrames={s.len} name={s.name}>
            <SceneFrame len={s.len}>
              <C />
            </SceneFrame>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
