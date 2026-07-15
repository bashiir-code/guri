'use client';

import { use, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/use-me';
import { Link } from '@/i18n/navigation';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BottomSheet } from '@/components/bottom-sheet';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface DealDetail {
  id: string;
  state: string;
  viewingAt: string | null;
  outcomeReason: string | null;
  createdAt: string;
  listing: {
    id: string;
    district: string;
    neighborhood: string | null;
    rentUsd: number;
    depositUsd: number;
  };
  customer?: { name: string | null; phone: string | null };
  agreement: { generatedAt: string; signedAt: string | null; hasSignedScan: boolean } | null;
  document: {
    id: string;
    idType: 'national_id' | 'passport';
    capturedVia: 'camera' | 'gallery';
    status: 'pending' | 'approved' | 'rejected';
    reviewNote: string | null;
    uploadedAt: string;
  } | null;
  timeline: Array<{ fromState: string | null; toState: string; at: string }>;
  viewerRole: 'customer' | 'agency';
}

type Outcome = 'proceed' | 'declined' | 'no_show';

// §5 agency screen 5 (phase-3 slice): timeline, viewing details, outcome
// control. Documents/verification/closing arrive in phases 4–5.
export default function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('deal');
  const ts = useTranslations('dealStates');
  const qc = useQueryClient();
  const { data: me } = useMe();
  // Verification is a permission, not a role (rule 9).
  const canVerify = me?.roles.agencyMemberships.some((m) => m.canVerify) ?? false;

  const { data: deal, isLoading } = useQuery<DealDetail>({
    queryKey: ['deal', id],
    queryFn: () => api(`/deals/${id}`),
  });

  // Every fetch issues a fresh audited presigned URL (§9) — deliberately.
  const { data: docView } = useQuery<{ url: string }>({
    queryKey: ['deal-doc', id, deal?.document?.id],
    queryFn: () => api(`/deals/${id}/documents/url`, { method: 'POST', body: {} }),
    enabled: canVerify && Boolean(deal?.document),
    staleTime: 4 * 60_000,
  });
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['deal', id] });
    void qc.invalidateQueries({ queryKey: ['dashboard'] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
  };

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [viewingAt, setViewingAt] = useState('');
  const [reason, setReason] = useState('');

  // ---- phase 5: agreement + atomic close ----
  const scanInput = useRef<HTMLInputElement>(null);
  const [closeStart, setCloseStart] = useState('');
  const [closeTerm, setCloseTerm] = useState('12');
  const [closeDeposit, setCloseDeposit] = useState('');
  const [closeRent, setCloseRent] = useState('');

  const generateAgreement = useMutation({
    mutationFn: () =>
      api(`/deals/${id}/agreement`, {
        body: {
          ...(closeTerm ? { termMonths: Number(closeTerm) } : {}),
          ...(closeStart ? { startDate: new Date(closeStart).toISOString() } : {}),
        },
      }),
    onSuccess: invalidate,
  });
  const downloadAgreement = useMutation({
    mutationFn: () => api<{ pdfUrl: string; signedUrl: string | null }>(`/deals/${id}/agreement`),
    onSuccess: (r) => window.open(r.signedUrl ?? r.pdfUrl, '_blank', 'noopener'),
  });
  const uploadScan = useMutation({
    mutationFn: async () => {
      const file = scanInput.current?.files?.[0];
      if (!file) throw new Error('no_file');
      const formData = new FormData();
      formData.append('file', file);
      return api(`/deals/${id}/agreement/signed`, { formData });
    },
    onSuccess: () => {
      if (scanInput.current) scanInput.current.value = '';
      invalidate();
    },
  });
  const closeDeal = useMutation({
    mutationFn: () => {
      const deposit = Number(closeDeposit || (deal?.listing.depositUsd ?? 0));
      const rent = Number(closeRent || (deal?.listing.rentUsd ?? 0));
      return api(`/deals/${id}/close`, {
        body: {
          termMonths: Number(closeTerm),
          startDate: new Date(closeStart).toISOString(),
          payments: [
            { type: 'deposit', amountUsd: deposit, paidOn: new Date().toISOString() },
            { type: 'monthly_rent', amountUsd: rent, paidOn: new Date().toISOString() },
          ],
        },
      });
    },
    onSuccess: invalidate,
  });

  const [verifySheet, setVerifySheet] = useState<'approve' | 'reject' | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const verify = useMutation({
    mutationFn: (decision: 'approve' | 'reject') =>
      api(`/deals/${id}/verify`, {
        body: { decision, ...(verifyNote.trim() ? { note: verifyNote.trim() } : {}) },
      }),
    onSuccess: () => {
      setVerifySheet(null);
      setVerifyNote('');
      invalidate();
    },
  });

  const recordOutcome = useMutation({
    mutationFn: (result: Outcome) =>
      api(`/deals/${id}/viewing-outcome`, {
        body: { result, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      }),
    onSuccess: () => {
      setOutcome(null);
      setReason('');
      invalidate();
    },
  });
  const reschedule = useMutation({
    mutationFn: () =>
      api(`/deals/${id}/reschedule`, { body: { viewingAt: new Date(viewingAt).toISOString() } }),
    onSuccess: () => {
      setRescheduling(false);
      setViewingAt('');
      invalidate();
    },
  });

  if (isLoading || !deal) return <p className="text-muted-foreground">…</p>;

  const chipClass = cn(
    'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
    deal.state === 'requested' && 'bg-lime/40 text-forest',
    ['viewing_scheduled', 'awaiting_docs', 'docs_in_review', 'approved'].includes(deal.state) &&
      'bg-amber_reserved/25 text-forest',
    deal.state === 'closed' && 'bg-forest text-mist',
    ['no_show', 'declined', 'declined_by_agency', 'withdrawn', 'expired', 'docs_rejected'].includes(
      deal.state,
    ) && 'bg-muted text-muted-foreground',
  );

  return (
    <main className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
          <Link
            href={`/console/listings/${deal.listing.id}/requests`}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {deal.listing.district}
            {deal.listing.neighborhood ? ` · ${deal.listing.neighborhood}` : ''} · $
            {Math.round(deal.listing.rentUsd)} — {t('backToQueue')}
          </Link>
        </div>
        <span className={chipClass}>{ts(deal.state)}</span>
      </div>

      {deal.customer && (
        <Card className="animate-rise-in">
          <CardHeader>
            <CardTitle className="text-lg">{t('customer')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-forest">{deal.customer.name ?? '—'}</p>
              <p className="text-sm text-muted-foreground">{deal.customer.phone ?? '—'}</p>
            </div>
            {deal.customer.phone && (
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm">
                  <a href={`tel:${deal.customer.phone}`}>{t('call')}</a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`https://wa.me/${deal.customer.phone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="animate-rise-in" style={{ animationDelay: '60ms' }}>
        <CardHeader>
          <CardTitle className="text-lg">{t('viewing')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate_brand">
            {deal.viewingAt ? formatDateTime(deal.viewingAt) : t('noViewingYet')}
          </p>
          {deal.outcomeReason && (
            <p className="text-sm text-muted-foreground">
              {t('reasonRecorded')}: {deal.outcomeReason}
            </p>
          )}

          {deal.state === 'requested' && (
            // Scheduling lives on the queue screen (one slot per listing —
            // the agent picks WHICH customer there), so route them to it.
            <Button asChild size="sm">
              <Link href={`/console/listings/${deal.listing.id}/requests`}>{t('openQueue')}</Link>
            </Button>
          )}
          {deal.state === 'viewing_scheduled' && (
            <>
              <div className="flex flex-wrap gap-2">
                {/* the screen's one Lime action: the happy path (§5) */}
                <Button size="sm" onClick={() => setOutcome('proceed')}>
                  {t('proceed')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setOutcome('declined')}>
                  {t('declinedOutcome')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setOutcome('no_show')}>
                  {t('noShow')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setRescheduling(true)}>
                  {t('reschedule')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('outcomeHint')}</p>
            </>
          )}
          {deal.state === 'awaiting_docs' && (
            <p className="text-sm text-muted-foreground">{t('awaitingDocsHint')}</p>
          )}
        </CardContent>
      </Card>

      {/* Document review pane — the image only renders for can_verify members
          (rule 9); everyone else sees the status line without it. */}
      {deal.document && (
        <Card className="animate-rise-in" style={{ animationDelay: '90ms' }}>
          <CardHeader>
            <CardTitle className="text-lg">{t('review.title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-3 py-1 font-semibold text-forest">
                {t(`review.${deal.document.idType}`)}
              </span>
              <span className="rounded-full bg-muted px-3 py-1 font-semibold text-forest">
                {t(`review.${deal.document.capturedVia}`)}
              </span>
              <span
                className={cn(
                  'rounded-full px-3 py-1 font-semibold',
                  deal.document.status === 'pending' && 'bg-amber_reserved/25 text-forest',
                  deal.document.status === 'approved' && 'bg-lime/40 text-forest',
                  deal.document.status === 'rejected' && 'bg-destructive/10 text-destructive',
                )}
              >
                {t(`review.status_${deal.document.status}`)}
              </span>
            </div>

            {canVerify ? (
              docView?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={docView.url}
                  alt=""
                  className="max-h-96 w-full rounded-card border object-contain"
                />
              ) : (
                <div className="h-48 animate-pulse rounded-card bg-muted" />
              )
            ) : (
              <p className="text-sm text-muted-foreground">{t('review.notVerifier')}</p>
            )}

            {deal.document.reviewNote && (
              <p className="text-sm text-muted-foreground">
                {t('reasonRecorded')}: {deal.document.reviewNote}
              </p>
            )}

            {canVerify && deal.state === 'docs_in_review' && deal.document.status === 'pending' && (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setVerifySheet('approve')}>
                  {t('review.approve')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-destructive text-destructive hover:bg-destructive/5"
                  onClick={() => setVerifySheet('reject')}
                >
                  {t('review.reject')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Phase 5: agreement + the atomic close (§4/§16). */}
      {(deal.state === 'approved' || deal.state === 'closed') && (
        <Card className="animate-rise-in border-2 border-lime/60" style={{ animationDelay: '100ms' }}>
          <CardHeader>
            <CardTitle className="text-lg">
              {deal.state === 'closed' ? t('close.closedTitle') : t('close.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deal.state === 'closed' ? (
              <>
                <p className="text-sm text-slate_brand">{t('close.closedBody')}</p>
                <Button variant="outline" size="sm" onClick={() => downloadAgreement.mutate()}>
                  {t('close.download')}
                </Button>
              </>
            ) : (
              <>
                {/* the paper terms — printed on the PDF and used by the close */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="close-start">{t('close.startDate')}</Label>
                    <Input
                      id="close-start"
                      type="date"
                      value={closeStart}
                      onChange={(e) => setCloseStart(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="close-term">{t('close.termMonths')}</Label>
                    <Input
                      id="close-term"
                      type="number"
                      min={1}
                      max={60}
                      value={closeTerm}
                      onChange={(e) => setCloseTerm(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={generateAgreement.isPending || !closeStart || !closeTerm}
                    onClick={() => generateAgreement.mutate()}
                  >
                    {deal.agreement ? t('close.regenerate') : t('close.generate')}
                  </Button>
                  {deal.agreement && (
                    <Button variant="ghost" size="sm" onClick={() => downloadAgreement.mutate()}>
                      {t('close.download')}
                    </Button>
                  )}
                  {deal.agreement && (
                    <>
                      <input
                        ref={scanInput}
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={() => uploadScan.mutate()}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={uploadScan.isPending}
                        onClick={() => scanInput.current?.click()}
                      >
                        {deal.agreement.hasSignedScan ? t('close.rescan') : t('close.uploadScan')}
                      </Button>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="close-deposit">{t('close.deposit')}</Label>
                    <Input
                      id="close-deposit"
                      type="number"
                      min={0}
                      placeholder={String(deal.listing.depositUsd)}
                      value={closeDeposit}
                      onChange={(e) => setCloseDeposit(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="close-rent">{t('close.firstRent')}</Label>
                    <Input
                      id="close-rent"
                      type="number"
                      min={0}
                      placeholder={String(deal.listing.rentUsd)}
                      value={closeRent}
                      onChange={(e) => setCloseRent(e.target.value)}
                    />
                  </div>
                </div>

                {/* each missing precondition, named (§4) */}
                <ul className="space-y-1 text-sm">
                  {[
                    { ok: Boolean(deal.agreement), label: t('close.needAgreement') },
                    { ok: Boolean(deal.agreement?.hasSignedScan), label: t('close.needScan') },
                    { ok: Boolean(closeStart), label: t('close.needStart') },
                    { ok: Boolean(closeTerm), label: t('close.needTerm') },
                  ].map((item, i) => (
                    <li
                      key={i}
                      className={cn(
                        'flex items-center gap-2',
                        item.ok ? 'text-forest' : 'text-muted-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                          item.ok ? 'bg-lime text-forest' : 'border border-muted-foreground/40',
                        )}
                      >
                        {item.ok ? '✓' : ''}
                      </span>
                      {item.label}
                    </li>
                  ))}
                </ul>

                {closeDeal.isError && (
                  <p className="text-sm text-destructive">{closeDeal.error.message}</p>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  disabled={
                    closeDeal.isPending ||
                    !deal.agreement?.hasSignedScan ||
                    !closeStart ||
                    !closeTerm
                  }
                  onClick={() => closeDeal.mutate()}
                >
                  {t('close.button')}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="animate-rise-in" style={{ animationDelay: '120ms' }}>
        <CardHeader>
          <CardTitle className="text-lg">{t('timeline')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-2 space-y-4 border-l pl-5">
            {deal.timeline.map((e, i) => (
              <li key={i} className="relative">
                <span
                  className={cn(
                    'absolute -left-[26px] top-1 h-3 w-3 rounded-full border-2 border-card',
                    i === deal.timeline.length - 1 ? 'bg-lime' : 'bg-slate_brand/50',
                  )}
                  aria-hidden
                />
                <p className="text-sm font-medium text-forest">
                  {e.fromState === null
                    ? t('created')
                    : e.fromState === e.toState
                      ? t('rescheduled')
                      : ts(e.toState)}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTime(e.at)}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <BottomSheet
        open={outcome !== null}
        onClose={() => setOutcome(null)}
        title={
          outcome === 'proceed'
            ? t('confirmProceedTitle')
            : outcome === 'declined'
              ? t('confirmDeclinedTitle')
              : t('confirmNoShowTitle')
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate_brand">
            {outcome === 'proceed' ? t('confirmProceedBody') : t('confirmOutcomeBody')}
          </p>
          {outcome !== 'proceed' && (
            <div className="space-y-2">
              <Label htmlFor="outcome-reason">{t('reason')}</Label>
              <Input
                id="outcome-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
          {recordOutcome.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button
            className="w-full"
            disabled={recordOutcome.isPending}
            onClick={() => outcome && recordOutcome.mutate(outcome)}
          >
            {t('confirmButton')}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={verifySheet !== null}
        onClose={() => setVerifySheet(null)}
        title={verifySheet === 'approve' ? t('review.confirmApproveTitle') : t('review.confirmRejectTitle')}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate_brand">
            {verifySheet === 'approve' ? t('review.confirmApproveBody') : t('review.confirmRejectBody')}
          </p>
          {verifySheet === 'reject' && (
            <div className="space-y-2">
              <Label htmlFor="verify-note">{t('review.noteRequired')}</Label>
              <Input
                id="verify-note"
                value={verifyNote}
                onChange={(e) => setVerifyNote(e.target.value)}
              />
            </div>
          )}
          {verify.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button
            className="w-full"
            disabled={verify.isPending || (verifySheet === 'reject' && verifyNote.trim().length < 2)}
            onClick={() => verifySheet && verify.mutate(verifySheet)}
          >
            {verifySheet === 'approve' ? t('review.approve') : t('review.reject')}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet open={rescheduling} onClose={() => setRescheduling(false)} title={t('reschedule')}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-viewing">{t('newTime')}</Label>
            <Input
              id="new-viewing"
              type="datetime-local"
              value={viewingAt}
              onChange={(e) => setViewingAt(e.target.value)}
            />
          </div>
          {reschedule.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <Button
            className="w-full"
            disabled={!viewingAt || reschedule.isPending}
            onClick={() => reschedule.mutate()}
          >
            {t('confirmReschedule')}
          </Button>
        </div>
      </BottomSheet>
    </main>
  );
}
