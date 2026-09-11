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
import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadSans } from '@remotion/google-fonts/Inter';

// Guri design language (apps/web/tailwind.config.ts)
const FOREST = '#173A31';
const LIME = '#B7F35D';
const MIST = '#F4F7F2';
const SLATE = '#5C6B64';
const AMBER = '#F2A93B';

const display = loadDisplay('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily;
const sans = loadSans('normal', { weights: ['400', '500', '600', '700', '800'], subsets: ['latin'] }).fontFamily;

const SCENES = [
  { name: 'intro', len: 90 },
  { name: 'hero', len: 120 },
  { name: 'browse', len: 165 },
  { name: 'tracker', len: 180 },
  { name: 'trust', len: 135 },
  { name: 'dashboard', len: 120 },
  { name: 'outro', len: 120 },
] as const;

export const PROMO_DURATION = SCENES.reduce((s, x) => s + x.len, 0);

const useSpring = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

// Fade + lift in at start, fade out at the end of each scene
const SceneFrame: React.FC<{ len: number; bg: string; children: React.ReactNode }> = ({
  len,
  bg,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 10, len - 10, len], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ backgroundColor: bg, fontFamily: sans }}>
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
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)`, ...style }}>{children}</div>
  );
};

const Pill: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 12,
      background: LIME,
      color: FOREST,
      borderRadius: 999,
      padding: '18px 40px',
      fontWeight: 700,
      fontSize: 34,
      ...style,
    }}
  >
    {children}
  </div>
);

const Check: React.FC<{ size?: number; color?: string; bg?: string }> = ({
  size = 28,
  color = FOREST,
  bg = LIME,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size,
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
      <path d="M5 12.5l4.5 4.5L19 7.5" stroke={color} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
);

/* ---------------- Scenes ---------------- */

const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const icon = useSpring(0, 10);
  const word = useSpring(14, 16);
  const tag = useSpring(30, 18);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 36 }}>
      <Img
        src={staticFile('icon.png')}
        style={{
          width: 240,
          height: 240,
          transform: `scale(${icon}) rotate(${(1 - icon) * -20}deg)`,
          boxShadow: `0 0 0 ${interpolate(frame, [10, 50], [0, 3], { extrapolateRight: 'clamp' })}px ${LIME}`,
          borderRadius: 56,
        }}
      />
      <div
        style={{
          fontFamily: display,
          fontSize: 190,
          fontWeight: 800,
          color: MIST,
          letterSpacing: -6,
          opacity: word,
          transform: `translateY(${(1 - word) * 30}px)`,
          lineHeight: 1,
        }}
      >
        Guri
      </div>
      <div style={{ fontSize: 40, color: LIME, opacity: tag, fontWeight: 500 }}>
        guri ka hel Muqdisho
      </div>
    </AbsoluteFill>
  );
};

const Hero: React.FC = () => {
  const frame = useCurrentFrame();
  const underline = interpolate(frame, [35, 60], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ padding: '0 180px', justifyContent: 'center' }}>
      <Rise>
        <div style={{ fontSize: 32, fontWeight: 600, color: SLATE, letterSpacing: 2, textTransform: 'uppercase' }}>
          Guri · verified agencies
        </div>
      </Rise>
      <Rise delay={8}>
        <div style={{ fontFamily: display, fontSize: 170, fontWeight: 800, color: FOREST, lineHeight: 1.02, letterSpacing: -5, marginTop: 24 }}>
          Find a home
        </div>
      </Rise>
      <Rise delay={18}>
        <div style={{ fontFamily: display, fontSize: 170, fontWeight: 800, color: FOREST, lineHeight: 1.02, letterSpacing: -5, position: 'relative', display: 'inline-block' }}>
          <span
            style={{
              position: 'absolute',
              left: -10,
              bottom: 18,
              height: 60,
              width: `calc(${underline}% + 20px)`,
              background: LIME,
              borderRadius: 14,
              zIndex: 0,
            }}
          />
          <span style={{ position: 'relative' }}>you can trust.</span>
        </div>
      </Rise>
      <Rise delay={40}>
        <div style={{ fontSize: 46, color: SLATE, marginTop: 36 }}>
          Every home listed by a verified agency in Mogadishu.
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

const LISTINGS = [
  { title: '3-bed villa', district: 'Hodan', price: 650, beds: 3, baths: 2, agency: 'Hiil Properties', hue: '#2E6B57' },
  { title: 'Modern apartment', district: 'Wadajir', price: 420, beds: 2, baths: 1, agency: 'Bakaal Realty', hue: '#3C7E6A' },
  { title: 'Family house', district: 'Km4 · Hodan', price: 800, beds: 4, baths: 3, agency: 'Xamar Homes', hue: '#24594A' },
];

const ListingCard: React.FC<{ l: (typeof LISTINGS)[number]; delay: number }> = ({ l, delay }) => {
  const p = useSpring(delay, 16);
  return (
    <div
      style={{
        background: 'white',
        borderRadius: 28,
        overflow: 'hidden',
        boxShadow: '0 12px 30px rgba(23,58,49,0.12)',
        opacity: p,
        transform: `translateX(${(1 - p) * 120}px)`,
      }}
    >
      <div
        style={{
          height: 150,
          background: `linear-gradient(135deg, ${l.hue}, ${FOREST})`,
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          padding: 16,
        }}
      >
        <svg width="110" height="90" viewBox="0 0 110 90" style={{ position: 'absolute', right: 24, bottom: 0, opacity: 0.35 }}>
          <path d="M5 45 L55 5 L105 45 L92 45 L92 90 L18 90 L18 45 Z" fill={LIME} />
        </svg>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(244,247,242,0.95)',
            color: FOREST,
            borderRadius: 999,
            padding: '6px 14px 6px 8px',
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          <Check size={22} /> Verified · {l.agency}
        </div>
      </div>
      <div style={{ padding: '16px 22px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: display, fontSize: 30, fontWeight: 700, color: FOREST }}>{l.title}</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: FOREST }}>
            ${l.price}
            <span style={{ fontSize: 20, color: SLATE, fontWeight: 500 }}>/mo</span>
          </div>
        </div>
        <div style={{ fontSize: 22, color: SLATE, marginTop: 4 }}>
          {l.district} · {l.beds} bd · {l.baths} ba
        </div>
      </div>
    </div>
  );
};

const Phone: React.FC<{ children: React.ReactNode; enter?: number }> = ({ children, enter = 0 }) => {
  const p = useSpring(enter, 18);
  return (
    <div
      style={{
        width: 560,
        height: 980,
        borderRadius: 72,
        background: FOREST,
        padding: 18,
        boxShadow: '0 40px 80px rgba(23,58,49,0.3)',
        transform: `translateY(${(1 - p) * 300}px)`,
        opacity: p,
      }}
    >
      <div style={{ width: '100%', height: '100%', borderRadius: 56, background: MIST, overflow: 'hidden', position: 'relative' }}>
        {children}
      </div>
    </div>
  );
};

const Browse: React.FC = () => (
  <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 140 }}>
    <div style={{ width: 720 }}>
      <Rise>
        <div style={{ fontSize: 30, fontWeight: 700, color: SLATE, letterSpacing: 2, textTransform: 'uppercase' }}>Browse</div>
      </Rise>
      <Rise delay={8}>
        <div style={{ fontFamily: display, fontSize: 100, fontWeight: 800, color: FOREST, lineHeight: 1.02, letterSpacing: -3, marginTop: 16 }}>
          Homes for rent, all verified.
        </div>
      </Rise>
      <Rise delay={20}>
        <div style={{ fontSize: 38, color: SLATE, marginTop: 30, lineHeight: 1.4 }}>
          Filter by district, rent and bedrooms. Every listing is tied to one accountable agency.
        </div>
      </Rise>
    </div>
    <Phone>
      <div style={{ padding: '56px 28px 0' }}>
        <div style={{ fontFamily: display, fontSize: 40, fontWeight: 800, color: FOREST }}>Homes for rent</div>
        <div
          style={{
            marginTop: 16,
            background: 'white',
            borderRadius: 999,
            padding: '16px 24px',
            fontSize: 22,
            color: SLATE,
            border: '1px solid #DCE3DF',
          }}
        >
          Search by home or district…
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          {['All districts', 'Any price', '2+ bd'].map((f, i) => (
            <div
              key={f}
              style={{
                padding: '8px 18px',
                borderRadius: 999,
                fontSize: 19,
                fontWeight: 600,
                background: i === 0 ? FOREST : 'white',
                color: i === 0 ? MIST : FOREST,
                border: '1px solid #DCE3DF',
              }}
            >
              {f}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 24 }}>
          {LISTINGS.map((l, i) => (
            <ListingCard key={l.title} l={l} delay={20 + i * 14} />
          ))}
        </div>
      </div>
    </Phone>
  </AbsoluteFill>
);

const STEPS = [
  { label: 'In queue', note: 'Request sent to the agency' },
  { label: 'Viewing scheduled', note: 'See the home in person' },
  { label: 'Upload your ID', note: 'National ID or passport' },
  { label: 'In verification', note: 'A person, not a machine, checks it' },
  { label: 'Approved — signing', note: 'The agency prepares the agreement' },
  { label: 'Rented', note: 'The home is yours' },
];

const Tracker: React.FC = () => {
  const frame = useCurrentFrame();
  const STEP_GAP = 20;
  const START = 25;
  const active = Math.min(STEPS.length - 1, Math.max(-1, Math.floor((frame - START) / STEP_GAP)));
  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 140 }}>
      <div style={{ width: 640 }}>
        <Rise>
          <div style={{ fontSize: 30, fontWeight: 700, color: LIME, letterSpacing: 2, textTransform: 'uppercase' }}>Your request</div>
        </Rise>
        <Rise delay={8}>
          <div style={{ fontFamily: display, fontSize: 100, fontWeight: 800, color: MIST, lineHeight: 1.02, letterSpacing: -3, marginTop: 16 }}>
            From viewing to keys.
          </div>
        </Rise>
        <Rise delay={20}>
          <div style={{ fontSize: 38, color: '#B9C9C1', marginTop: 30, lineHeight: 1.4 }}>
            Track every step. Identity is only verified when you're ready to close the deal.
          </div>
        </Rise>
      </div>
      <div style={{ width: 760, background: 'rgba(244,247,242,0.06)', borderRadius: 40, padding: '44px 52px', border: '1px solid rgba(183,243,93,0.18)' }}>
        {STEPS.map((s, i) => {
          const done = i < active;
          const current = i === active;
          const reached = i <= active;
          const pop = spring({ frame: frame - (START + i * STEP_GAP), fps: 30, config: { damping: 10 } });
          const isLast = i === STEPS.length - 1;
          return (
            <div key={s.label} style={{ display: 'flex', gap: 28, position: 'relative', paddingBottom: isLast ? 0 : 30 }}>
              {!isLast && (
                <div style={{ position: 'absolute', left: 21, top: 48, bottom: 4, width: 4, background: 'rgba(244,247,242,0.15)', borderRadius: 2 }}>
                  <div style={{ width: '100%', height: `${done ? 100 : 0}%`, background: LIME, borderRadius: 2 }} />
                </div>
              )}
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 46,
                  flexShrink: 0,
                  background: reached ? LIME : 'transparent',
                  border: reached ? 'none' : '3px solid rgba(244,247,242,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `scale(${reached ? 0.7 + pop * 0.3 : 1})`,
                  boxShadow: current ? `0 0 0 10px rgba(183,243,93,0.2)` : 'none',
                }}
              >
                {reached && (
                  <svg width="26" height="26" viewBox="0 0 24 24">
                    <path d="M5 12.5l4.5 4.5L19 7.5" stroke={FOREST} strokeWidth={3.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ opacity: reached ? 1 : 0.45 }}>
                <div style={{ fontSize: 34, fontWeight: 700, color: isLast && reached ? LIME : MIST }}>{s.label}</div>
                <div style={{ fontSize: 24, color: '#B9C9C1', marginTop: 2 }}>{s.note}</div>
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const PILLARS = [
  { title: 'Verified agencies', body: 'Every home is represented by a real, accountable agency.', icon: 'M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z' },
  { title: 'Human ID checks', body: 'Your ID is reviewed by a person — only at closing.', icon: 'M4 5h16v14H4z M8 10a2 2 0 104 0 2 2 0 10-4 0 M14 9h4 M14 13h4 M7 16h6' },
  { title: 'Immutable audit log', body: 'Every document view and decision is recorded forever.', icon: 'M6 3h9l4 4v14H6z M9 11h7 M9 15h7 M9 7h4' },
  { title: 'Somali + English', body: 'Built for Mogadishu. Works offline as an app.', icon: 'M3 12h18 M12 3a14 14 0 010 18 M12 3a14 14 0 000 18 M12 3a9 9 0 110 18 9 9 0 010-18' },
];

const Trust: React.FC = () => (
  <AbsoluteFill style={{ padding: '0 140px', justifyContent: 'center' }}>
    <Rise>
      <div style={{ fontFamily: display, fontSize: 96, fontWeight: 800, color: FOREST, letterSpacing: -3, textAlign: 'center' }}>
        Trust, built in.
      </div>
    </Rise>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, marginTop: 70 }}>
      {PILLARS.map((p, i) => (
        <Rise key={p.title} delay={14 + i * 8}>
          <div style={{ background: 'white', borderRadius: 32, padding: '44px 36px 52px', height: 440, boxShadow: '0 12px 30px rgba(23,58,49,0.08)' }}>
            <div style={{ width: 88, height: 88, borderRadius: 24, background: FOREST, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24">
                <path d={p.icon} stroke={LIME} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div style={{ fontFamily: display, fontSize: 40, fontWeight: 700, color: FOREST, marginTop: 36, lineHeight: 1.1 }}>{p.title}</div>
            <div style={{ fontSize: 26, color: SLATE, marginTop: 16, lineHeight: 1.4 }}>{p.body}</div>
          </div>
        </Rise>
      ))}
    </div>
  </AbsoluteFill>
);

const STATS = [
  { label: 'Active listings', value: 48, prefix: '' },
  { label: 'New leads', value: 17, prefix: '' },
  { label: 'Viewings this week', value: 23, prefix: '' },
  { label: 'Rent this month', value: 12450, prefix: '$' },
];

const Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ padding: '0 160px', justifyContent: 'center' }}>
      <Rise>
        <div style={{ fontSize: 30, fontWeight: 700, color: LIME, letterSpacing: 2, textTransform: 'uppercase' }}>For agencies & owners</div>
      </Rise>
      <Rise delay={8}>
        <div style={{ fontFamily: display, fontSize: 96, fontWeight: 800, color: MIST, letterSpacing: -3, marginTop: 16 }}>
          One console. Every deal.
        </div>
      </Rise>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 28, marginTop: 64 }}>
        {STATS.map((s, i) => {
          const t = interpolate(frame, [20 + i * 6, 70 + i * 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const eased = 1 - Math.pow(1 - t, 3);
          const v = Math.round(s.value * eased);
          return (
            <Rise key={s.label} delay={14 + i * 6}>
              <div
                style={{
                  background: i === 3 ? LIME : 'rgba(244,247,242,0.07)',
                  borderRadius: 32,
                  padding: '40px 36px',
                  border: i === 3 ? 'none' : '1px solid rgba(244,247,242,0.12)',
                }}
              >
                <div style={{ fontSize: 26, color: i === 3 ? FOREST : '#B9C9C1', fontWeight: 600 }}>{s.label}</div>
                <div style={{ fontFamily: display, fontSize: 96, fontWeight: 800, color: i === 3 ? FOREST : MIST, marginTop: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {s.prefix}
                  {v.toLocaleString('en-US')}
                </div>
              </div>
            </Rise>
          );
        })}
      </div>
      <Rise delay={50}>
        <div style={{ display: 'flex', gap: 16, marginTop: 44, flexWrap: 'wrap' }}>
          {[
            ['New', MIST],
            ['Viewing', MIST],
            ['Awaiting docs', AMBER],
            ['In review', MIST],
            ['Approved', LIME],
          ].map(([label, color]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderRadius: 999, border: '1px solid rgba(244,247,242,0.2)', fontSize: 26, color: MIST }}>
              <div style={{ width: 14, height: 14, borderRadius: 14, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </Rise>
    </AbsoluteFill>
  );
};

const Outro: React.FC = () => {
  const icon = useSpring(0, 12);
  const cta = useSpring(30, 12);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36, transform: `scale(${0.8 + icon * 0.2})`, opacity: icon }}>
        <Img src={staticFile('icon.png')} style={{ width: 170, height: 170, borderRadius: 40 }} />
        <div style={{ fontFamily: display, fontSize: 170, fontWeight: 800, color: MIST, letterSpacing: -6 }}>Guri</div>
      </div>
      <Rise delay={14}>
        <div style={{ fontSize: 46, color: '#B9C9C1', marginTop: 30 }}>Find a home you can trust.</div>
      </Rise>
      <div style={{ marginTop: 60, transform: `scale(${cta})` }}>
        <Pill style={{ fontSize: 44, padding: '24px 56px' }}>
          Browse homes
          <svg width="36" height="36" viewBox="0 0 24 24">
            <path d="M5 12h14 M13 6l6 6-6 6" stroke={FOREST} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Pill>
      </div>
      <Rise delay={40}>
        <div style={{ fontSize: 40, color: LIME, marginTop: 50, fontWeight: 700, letterSpacing: 1 }}>getguri.com</div>
      </Rise>
    </AbsoluteFill>
  );
};

const RENDER: Record<(typeof SCENES)[number]['name'], { C: React.FC; bg: string }> = {
  intro: { C: Intro, bg: FOREST },
  hero: { C: Hero, bg: MIST },
  browse: { C: Browse, bg: MIST },
  tracker: { C: Tracker, bg: FOREST },
  trust: { C: Trust, bg: MIST },
  dashboard: { C: Dashboard, bg: FOREST },
  outro: { C: Outro, bg: FOREST },
};

export const GuriPromo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: FOREST }}>
      {SCENES.map((s) => {
        const start = from;
        from += s.len;
        const { C, bg } = RENDER[s.name];
        return (
          <Sequence key={s.name} from={start} durationInFrames={s.len} name={s.name}>
            <SceneFrame len={s.len} bg={bg}>
              <C />
            </SceneFrame>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
