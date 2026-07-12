'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import imageCompression from 'browser-image-compression';
import { Camera, Images } from 'lucide-react';
import type { CapturedVia, CustomerDocumentType } from '@guri/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Rule 11 — strict on WHAT, lenient on HOW: national ID or passport only,
// captured straight from the camera (gallery as fallback), preview + retake,
// client-side compression. NO OCR, no auto-crop, no client-side vision — the
// human verifier judges quality.
export function IdCapture({ dealId }: { dealId: string }) {
  const t = useTranslations('tracker.capture');
  const qc = useQueryClient();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  const [idType, setIdType] = useState<CustomerDocumentType>('national_id');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedVia, setCapturedVia] = useState<CapturedVia>('camera');

  function pick(source: CapturedVia, files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setCapturedVia(source);
    setPreviewUrl(URL.createObjectURL(f));
  }

  function retake() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (cameraInput.current) cameraInput.current.value = '';
    if (galleryInput.current) galleryInput.current.value = '';
  }

  const submit = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('no_file');
      const compressed = await imageCompression(file, {
        maxWidthOrHeight: 1600,
        maxSizeMB: 1,
        useWebWorker: true,
      });
      const formData = new FormData();
      formData.append('idType', idType);
      formData.append('capturedVia', capturedVia);
      formData.append('file', compressed, file.name || 'id.jpg');
      return api(`/deals/${dealId}/documents`, { formData });
    },
    onSuccess: () => {
      retake();
      void qc.invalidateQueries({ queryKey: ['deal', dealId] });
      void qc.invalidateQueries({ queryKey: ['my-requests'] });
    },
  });

  const typePill = (value: CustomerDocumentType, label: string) => (
    <button
      type="button"
      onClick={() => setIdType(value)}
      className={cn(
        'rounded-full border px-4 py-1.5 text-sm font-medium transition-colors',
        idType === value ? 'border-forest bg-forest text-mist' : 'bg-card text-forest',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {typePill('national_id', t('nationalId'))}
        {typePill('passport', t('passport'))}
      </div>

      {/* camera first; gallery as fallback (§3) */}
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => pick('camera', e.target.files)}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => pick('gallery', e.target.files)}
      />

      {!previewUrl ? (
        <div className="space-y-2">
          <Button className="w-full" size="lg" onClick={() => cameraInput.current?.click()}>
            <Camera className="h-4 w-4" aria-hidden /> {t('takePhoto')}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => galleryInput.current?.click()}>
            <Images className="h-4 w-4" aria-hidden /> {t('fromGallery')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('hint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt=""
            className="animate-pop max-h-72 w-full rounded-card border object-contain"
          />
          {submit.isError && <p className="text-sm text-destructive">{t('failed')}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={retake} disabled={submit.isPending}>
              {t('retake')}
            </Button>
            <Button className="flex-1" onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? t('sending') : t('submit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
