'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { LISTING_TYPES, MOGADISHU_DISTRICTS, type ListingType } from '@guri/shared';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useMe } from '@/hooks/use-me';
import { PublicHeader } from '@/components/public-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface DirectoryAgency {
  id: string;
  name: string;
  districts: string[];
  liveListings: number;
}

// §15 owner "List my house" wizard: basics → photos → docs → pick an agency.
// Any signed-in user can use it — submitting grants the owner role (rule 15),
// no second account. Nothing here becomes public; it's a lead to one agency.
export default function ListHousePage() {
  return (
    <Suspense fallback={<PublicHeader />}>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  const t = useTranslations('intake.wizard');
  const router = useRouter();
  const params = useSearchParams();
  const { isSignedIn, isLoading: meLoading } = useMe();

  const [step, setStep] = useState(0);
  const [district, setDistrict] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [type, setType] = useState<ListingType>('house');
  const [bedrooms, setBedrooms] = useState('2');
  const [bathrooms, setBathrooms] = useState('1');
  const [expectedRent, setExpectedRent] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [docs, setDocs] = useState<File[]>([]);
  const [agencyId, setAgencyId] = useState(params.get('agency') ?? '');
  const [photoError, setPhotoError] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const { data: agencies } = useQuery<DirectoryAgency[]>({
    queryKey: ['agencies', district],
    queryFn: () => api(`/agencies${district ? `?district=${encodeURIComponent(district)}` : ''}`),
    enabled: step === 3,
  });

  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.set('agencyId', agencyId);
      fd.set('district', district);
      if (neighborhood) fd.set('neighborhood', neighborhood);
      fd.set('type', type);
      fd.set('bedrooms', bedrooms);
      fd.set('bathrooms', bathrooms);
      if (expectedRent) fd.set('expectedRentUsd', expectedRent);
      if (notes) fd.set('notes', notes);
      photos.forEach((p) => fd.append('photos', p));
      docs.forEach((d) => fd.append('docs', d));
      return api<{ id: string }>('/intakes', { formData: fd });
    },
  });

  if (!meLoading && !isSignedIn) {
    return (
      <>
        <PublicHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="font-display text-2xl font-bold text-forest">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground">{t('intro')}</p>
          <Button asChild className="mt-6">
            <Link href="/sign-in">Guri</Link>
          </Button>
        </main>
      </>
    );
  }

  if (submit.isSuccess) {
    return (
      <>
        <PublicHeader />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <div className="animate-pop text-5xl">🎉</div>
          <h1 className="mt-4 font-display text-2xl font-bold text-forest">{t('successTitle')}</h1>
          <p className="mt-2 text-muted-foreground">{t('successBody')}</p>
          <Button asChild className="mt-6">
            <Link href="/owner/intakes">{t('viewStatus')}</Link>
          </Button>
        </main>
      </>
    );
  }

  const canNext =
    step === 0
      ? district.length >= 2 && Number(bedrooms) >= 0 && Number(bathrooms) >= 0
      : step === 1
        ? photos.length > 0
        : true;

  const steps = [t('basics'), t('photosStep'), t('docsStep'), t('agencyStep')];

  return (
    <>
      <PublicHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-6 md:max-w-2xl md:py-8 lg:max-w-5xl lg:py-10">
        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:items-start lg:gap-10">
          {/* Progress: horizontal bars on phone/tablet, a vertical step rail on desktop. */}
          <div className="mb-6 lg:mb-0 lg:sticky lg:top-8">
            <h1 className="font-display text-2xl font-bold text-forest lg:text-3xl">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('step', { n: step + 1 })}</p>
            <div className="mt-3 flex gap-1.5 lg:hidden">
              {steps.map((s, i) => (
                <div
                  key={s}
                  className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-lime' : 'bg-muted')}
                />
              ))}
            </div>
            <ol className="mt-6 hidden flex-col gap-1 lg:flex">
              {steps.map((s, i) => (
                <li
                  key={s}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold',
                    i === step
                      ? 'bg-lime/[0.18] text-forest'
                      : i < step
                        ? 'text-forest'
                        : 'text-muted-foreground',
                  )}
                >
                  <span
                    className={cn(
                      'grid h-6 w-6 flex-none place-items-center rounded-full text-xs font-bold',
                      i <= step ? 'bg-forest text-lime' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {i < step ? '✓' : i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <div className="space-y-6">
            <div className="rounded-card border bg-card p-5 md:p-6">
          <h2 className="mb-4 font-display text-lg font-bold text-forest">{steps[step]}</h2>

          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="district">{t('district')}</Label>
                  <Select id="district" value={district} onChange={(e) => setDistrict(e.target.value)}>
                    <option value="">—</option>
                    {MOGADISHU_DISTRICTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="neighborhood">{t('neighborhood')}</Label>
                  <Input id="neighborhood" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="type">{t('type')}</Label>
                  <Select id="type" value={type} onChange={(e) => setType(e.target.value as ListingType)}>
                    {LISTING_TYPES.map((ty) => (
                      <option key={ty} value={ty}>
                        {t(`typeLabels.${ty}`)}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bedrooms">{t('bedrooms')}</Label>
                  <Input id="bedrooms" type="number" min={0} value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bathrooms">{t('bathrooms')}</Label>
                  <Input id="bathrooms" type="number" min={0} value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rent">{t('expectedRent')}</Label>
                <Input id="rent" type="number" min={0} value={expectedRent} onChange={(e) => setExpectedRent(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t('notes')}</Label>
                <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('photosHint')}</p>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  setPhotos((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 12));
                  setPhotoError(false);
                }}
              />
              <Button variant="outline" type="button" onClick={() => photoInput.current?.click()}>
                {t('addPhotos')}
              </Button>
              {photoError && <p className="text-sm text-destructive">{t('photosRequired')}</p>}
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {previews.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="" className="aspect-square w-full rounded-xl object-cover"
                    onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} />
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('docsHint')}</p>
              <input
                ref={docInput}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => setDocs((prev) => [...prev, ...Array.from(e.target.files ?? [])].slice(0, 6))}
              />
              <Button variant="outline" type="button" onClick={() => docInput.current?.click()}>
                {t('addDocs')}
              </Button>
              <ul className="space-y-1 text-sm text-slate_brand">
                {docs.map((d, i) => (
                  <li key={d.name + i} className="flex items-center justify-between rounded-lg bg-mist px-3 py-2">
                    <span className="truncate">{d.name}</span>
                    <button type="button" className="text-muted-foreground" onClick={() => setDocs((p) => p.filter((_, j) => j !== i))}>
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t('pickHint')}</p>
              <ul className="space-y-2">
                {agencies?.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => setAgencyId(a.id)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border p-4 text-left',
                        agencyId === a.id ? 'border-forest bg-mist' : 'hover:bg-muted',
                      )}
                    >
                      <div>
                        <p className="font-display font-bold text-forest">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{a.districts.join(', ')}</p>
                      </div>
                      <span className="text-sm font-semibold text-forest">
                        {agencyId === a.id ? `✓ ${t('selected')}` : t('select')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {submit.isError && <p className="text-sm text-destructive">{submit.error.message}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" type="button" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            {t('back')}
          </Button>
          {step < 3 ? (
            <Button
              type="button"
              onClick={() => {
                if (step === 1 && photos.length === 0) return setPhotoError(true);
                if (canNext) setStep((s) => s + 1);
              }}
              disabled={!canNext}
            >
              {t('next')}
            </Button>
          ) : (
            <Button type="button" disabled={!agencyId || submit.isPending} onClick={() => submit.mutate()}>
              {submit.isPending ? t('submitting') : t('submit')}
            </Button>
          )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
