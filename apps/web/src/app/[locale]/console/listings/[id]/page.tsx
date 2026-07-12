'use client';

import { use, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import imageCompression from 'browser-image-compression';
import type { ListingFieldsInput } from '@guri/shared';
import { api } from '@/lib/api';
import { Link } from '@/i18n/navigation';
import { ListingForm } from '@/components/listing-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusChip } from '@/components/status-chip';

interface ListingDetail extends ListingFieldsInput {
  id: string;
  status: 'available' | 'reserved' | 'rented';
  originalsVerified: boolean;
  publishedAt: string | null;
  photos: Array<{ key: string; url: string }>;
  ownerDocs: Array<{ id: string; label: string; note: string | null; createdAt: string }>;
}

export default function ListingEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('listings');
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['listing', id] });
    void qc.invalidateQueries({ queryKey: ['listings'] });
  };

  const { data: listing } = useQuery<ListingDetail>({
    queryKey: ['listing', id],
    queryFn: () => api(`/agency/listings/${id}`),
  });

  const save = useMutation({
    mutationFn: (input: ListingFieldsInput) =>
      api(`/listings/${id}`, { method: 'PATCH', body: input }),
    onSuccess: invalidate,
  });

  // Photos — compressed client-side (§11: data is expensive), re-compressed
  // server-side to ≤1280px WebP.
  const photoInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(files)) {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1280,
          maxSizeMB: 1,
          useWebWorker: true,
        });
        formData.append('photos', compressed, file.name);
      }
      await api(`/listings/${id}/photos`, { formData });
      invalidate();
    } finally {
      setUploading(false);
      if (photoInput.current) photoInput.current.value = '';
    }
  }

  // Owner documents — free-text label + optional note + file.
  const [docLabel, setDocLabel] = useState('');
  const [docNote, setDocNote] = useState('');
  const docInput = useRef<HTMLInputElement>(null);
  const addDoc = useMutation({
    mutationFn: async () => {
      const file = docInput.current?.files?.[0];
      if (!file || !docLabel.trim()) throw new Error(t('docs.missing'));
      const formData = new FormData();
      formData.append('label', docLabel.trim());
      if (docNote.trim()) formData.append('note', docNote.trim());
      formData.append('file', file);
      return api(`/listings/${id}/owner-docs`, { formData });
    },
    onSuccess: () => {
      setDocLabel('');
      setDocNote('');
      if (docInput.current) docInput.current.value = '';
      invalidate();
    },
  });

  async function viewDoc(docId: string) {
    const { url } = await api<{ url: string }>(`/owner-docs/${docId}/url`, { method: 'POST' });
    window.open(url, '_blank', 'noopener');
  }

  // Publish gate — checkbox persists via PATCH, publish enforces it server-side.
  const setAttestation = useMutation({
    mutationFn: (originalsVerified: boolean) =>
      api(`/listings/${id}`, { method: 'PATCH', body: { originalsVerified } }),
    onSuccess: invalidate,
  });
  const publish = useMutation({
    mutationFn: () => api(`/listings/${id}/publish`, { body: { originalsVerified: true } }),
    onSuccess: invalidate,
  });

  if (!listing) return <p className="text-muted-foreground">…</p>;

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-forest">{t('edit')}</h1>
        <div className="flex items-center gap-2">
          {listing.publishedAt && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/console/listings/${id}/requests`}>{t('requestsLink')}</Link>
            </Button>
          )}
          <StatusChip status={listing.status} publishedAt={listing.publishedAt} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('detailsTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ListingForm
            defaults={listing}
            submitLabel={t('saveButton')}
            onSubmit={(v) => save.mutate(v)}
            pending={save.isPending}
            error={save.isError ? save.error.message : null}
          />
          {save.isSuccess && <p className="mt-2 text-sm text-forest">{t('saved')}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('photos.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listing.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {listing.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.key}
                  src={p.url}
                  alt=""
                  className="h-28 w-full rounded-xl object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void uploadPhotos(e.target.files)}
          />
          <Button variant="outline" disabled={uploading} onClick={() => photoInput.current?.click()}>
            {uploading ? t('photos.uploading') : t('photos.add')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('docs.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2">
            {listing.ownerDocs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl border px-4 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{d.label}</p>
                  {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => void viewDoc(d.id)}>
                  {t('docs.view')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="space-y-3 rounded-xl border border-dashed p-4">
            <div className="space-y-2">
              <Label htmlFor="doc-label">{t('docs.label')}</Label>
              <Input
                id="doc-label"
                value={docLabel}
                placeholder={t('docs.labelHint')}
                onChange={(e) => setDocLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-note">{t('docs.note')}</Label>
              <Input id="doc-note" value={docNote} onChange={(e) => setDocNote(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-file">{t('docs.file')}</Label>
              <input id="doc-file" ref={docInput} type="file" className="block text-sm" />
            </div>
            {addDoc.isError && <p className="text-sm text-destructive">{addDoc.error.message}</p>}
            <Button variant="outline" disabled={addDoc.isPending} onClick={() => addDoc.mutate()}>
              {t('docs.add')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('publish.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listing.publishedAt ? (
            <p className="text-sm text-forest">{t('publish.published')}</p>
          ) : (
            <>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-forest"
                  checked={listing.originalsVerified}
                  disabled={setAttestation.isPending}
                  onChange={(e) => setAttestation.mutate(e.target.checked)}
                />
                <span>{t('publish.attest')}</span>
              </label>
              {listing.photos.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('publish.needPhotos')}</p>
              )}
              {publish.isError && <p className="text-sm text-destructive">{publish.error.message}</p>}
              <Button
                disabled={!listing.originalsVerified || listing.photos.length === 0 || publish.isPending}
                onClick={() => publish.mutate()}
              >
                {t('publish.button')}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
