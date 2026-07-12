'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import type { ListingFieldsInput } from '@guri/shared';
import { api } from '@/lib/api';
import { ListingForm } from '@/components/listing-form';

export default function NewListingPage() {
  const t = useTranslations('listings');
  const router = useRouter();
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: (input: ListingFieldsInput) => api<{ id: string }>('/listings', { body: input }),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ['listings'] });
      router.push(`/console/listings/${created.id}`);
    },
  });

  return (
    <main className="mx-auto max-w-2xl">
      <h1 className="mb-6 font-display text-2xl font-bold text-forest">{t('new')}</h1>
      <ListingForm
        submitLabel={t('createButton')}
        onSubmit={(v) => create.mutate(v)}
        pending={create.isPending}
        error={create.isError ? create.error.message : null}
      />
    </main>
  );
}
