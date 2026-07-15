'use client';

import { useLocale } from 'next-intl';
import { Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { LegalTitle } from '@/components/legal-ui';
import { PRIVACY_EMAIL, SUPPORT_EMAIL, WHATSAPP, whatsappHref } from '@/lib/contact';

export default function ContactPage() {
  const locale = useLocale();
  const so = locale === 'so';

  const cards = [
    {
      icon: Mail,
      title: so ? 'Taageerada guud' : 'General support',
      body: so
        ? 'Su’aalo ku saabsan gelitaanka, liisas, ama codsiyada.'
        : 'Questions about signing in, listings, or requests.',
      action: SUPPORT_EMAIL,
      href: `mailto:${SUPPORT_EMAIL}`,
    },
    {
      icon: MessageCircle,
      title: so ? 'WhatsApp' : 'WhatsApp',
      body: so ? 'Naga hel WhatsApp saacadaha shaqada.' : 'Reach us on WhatsApp during working hours.',
      action: WHATSAPP,
      href: whatsappHref(),
    },
    {
      icon: ShieldCheck,
      title: so ? 'Xogta & asturnaanta' : 'Data & privacy',
      body: so
        ? 'Codso helitaan, saxid, ama tirtiridda xogtaada.'
        : 'Request access, correction, or deletion of your data.',
      action: PRIVACY_EMAIL,
      href: `mailto:${PRIVACY_EMAIL}`,
    },
  ];

  return (
    <>
      <LegalTitle
        title={so ? 'Xiriir & taageero' : 'Contact & support'}
        subtitle={
          so
            ? 'Waxaan halkan u joognaa inaan ku caawinno — nagala soo xiriir habka kugu haboon.'
            : 'We’re here to help — reach us the way that suits you.'
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <a
              key={c.title}
              href={c.href}
              target={c.href.startsWith('http') ? '_blank' : undefined}
              rel={c.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="flex flex-col gap-2 rounded-card border bg-card p-5 transition-colors hover:border-forest/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-mist text-forest">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <p className="font-display text-base font-bold text-forest">{c.title}</p>
              <p className="text-sm text-slate_brand">{c.body}</p>
              <p className="mt-1 text-sm font-semibold text-forest underline underline-offset-2">
                {c.action}
              </p>
            </a>
          );
        })}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        {so
          ? 'Waxaan ku dadaalnaa inaan kaaga jawaabno 2 maalmood shaqo gudahood.'
          : 'We aim to respond within 2 business days.'}
      </p>
    </>
  );
}
