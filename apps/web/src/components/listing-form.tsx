'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import {
  listingFieldsSchema,
  LISTING_TYPES,
  MOGADISHU_DISTRICTS,
  type ListingFieldsInput,
} from '@guri/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface OwnerOption {
  id: string;
  name: string | null;
  phone: string;
}

export function ListingForm({
  defaults,
  submitLabel,
  onSubmit,
  pending,
  error,
}: {
  defaults?: Partial<ListingFieldsInput>;
  submitLabel: string;
  onSubmit: (values: ListingFieldsInput) => void;
  pending: boolean;
  error: string | null;
}) {
  const t = useTranslations('listings.fields');
  const tt = useTranslations('listings.types');
  const { data: owners } = useQuery<OwnerOption[]>({
    queryKey: ['owners'],
    queryFn: () => api('/owners'),
  });

  const form = useForm<ListingFieldsInput>({
    resolver: zodResolver(listingFieldsSchema),
    defaultValues: defaults,
  });
  const errors = form.formState.errors;

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="ownerId">{t('owner')}</Label>
        <Select id="ownerId" {...form.register('ownerId')}>
          <option value="">—</option>
          {owners?.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name ?? o.phone} ({o.phone})
            </option>
          ))}
        </Select>
        {errors.ownerId && <p className="text-sm text-destructive">{t('ownerRequired')}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="district">{t('district')}</Label>
          <Select id="district" {...form.register('district')}>
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
          <Input id="neighborhood" placeholder={t('neighborhoodHint')} {...form.register('neighborhood')} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="type">{t('type')}</Label>
          <Select id="type" {...form.register('type')}>
            {LISTING_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {tt(ty)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bedrooms">{t('bedrooms')}</Label>
          <Input id="bedrooms" type="number" min={0} {...form.register('bedrooms')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bathrooms">{t('bathrooms')}</Label>
          <Input id="bathrooms" type="number" min={0} {...form.register('bathrooms')} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="rentUsd">{t('rentUsd')}</Label>
          <Input id="rentUsd" type="number" min={1} step="1" {...form.register('rentUsd')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="depositUsd">{t('depositUsd')}</Label>
          <Input id="depositUsd" type="number" min={0} step="1" {...form.register('depositUsd')} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="descriptionSo">{t('descriptionSo')}</Label>
        <Textarea id="descriptionSo" {...form.register('descriptionSo')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="descriptionEn">{t('descriptionEn')}</Label>
        <Textarea id="descriptionEn" {...form.register('descriptionEn')} />
      </div>

      {Object.keys(errors).length > 0 && (
        <p className="text-sm text-destructive">{t('checkFields')}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
