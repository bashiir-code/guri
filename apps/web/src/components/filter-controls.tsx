'use client';

import { useTranslations } from 'next-intl';
import { LISTING_TYPES, MOGADISHU_DISTRICTS, type ListingSort } from '@guri/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

export interface BrowseFilters {
  district: string;
  minRent: string;
  maxRent: string;
  beds: string;
  type: string;
  sort: ListingSort;
}
export const EMPTY_FILTERS: BrowseFilters = {
  district: '',
  minRent: '',
  maxRent: '',
  beds: '',
  type: '',
  sort: 'newest',
};

// Slider tops come from the listings actually on show (API `bounds`), so the
// range always matches the market instead of an arbitrary number.
export interface BrowseBounds {
  maxRent: number;
  maxBedrooms: number;
}
export const DEFAULT_BOUNDS: BrowseBounds = { maxRent: 1000, maxBedrooms: 5 };

const RENT_STEP = 10;

// One set of controls, rendered inside the phone bottom sheet AND the laptop
// sidebar so the two can never drift apart.
export function FilterControls({
  draft,
  setDraft,
  bounds = DEFAULT_BOUNDS,
  onApply,
  onClear,
}: {
  draft: BrowseFilters;
  setDraft: (f: BrowseFilters) => void;
  bounds?: BrowseBounds;
  onApply: () => void;
  onClear: () => void;
}) {
  const t = useTranslations('browse');
  const tt = useTranslations('listings.types');

  const rentLo = draft.minRent ? Math.min(Number(draft.minRent), bounds.maxRent) : 0;
  const rentHi = draft.maxRent ? Math.min(Number(draft.maxRent), bounds.maxRent) : bounds.maxRent;
  const beds = draft.beds ? Math.min(Number(draft.beds), bounds.maxBedrooms) : 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>{t('district')}</Label>
        <Select value={draft.district} onChange={(e) => setDraft({ ...draft, district: e.target.value })}>
          <option value="">{t('anyDistrict')}</option>
          {MOGADISHU_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <Label>{t('rent')}</Label>
          <span className="text-sm font-semibold text-forest">
            ${rentLo} – ${rentHi}
            {rentHi >= bounds.maxRent ? '+' : ''}
          </span>
        </div>
        <Slider
          min={0}
          max={bounds.maxRent}
          step={RENT_STEP}
          minStepsBetweenThumbs={1}
          value={[rentLo, rentHi]}
          onValueChange={([lo, hi]) =>
            setDraft({
              ...draft,
              minRent: lo > 0 ? String(lo) : '',
              maxRent: hi >= bounds.maxRent ? '' : String(hi),
            })
          }
          aria-label={t('rent')}
        />
        <p className="text-xs text-muted-foreground">{t('rentHint', { max: bounds.maxRent })}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <Label>{t('beds')}</Label>
          <span className="text-sm font-semibold text-forest">
            {beds > 0 ? `${beds}+` : t('anyBeds')}
          </span>
        </div>
        <Slider
          min={0}
          max={bounds.maxBedrooms}
          step={1}
          value={[beds]}
          onValueChange={([n]) => setDraft({ ...draft, beds: n > 0 ? String(n) : '' })}
          aria-label={t('beds')}
        />
      </div>

      <div className="space-y-2">
        <Label>{t('type')}</Label>
        <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
          <option value="">{t('anyType')}</option>
          {LISTING_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {tt(ty)}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-2">
        <Label>{t('sort')}</Label>
        <Select
          value={draft.sort}
          onChange={(e) => setDraft({ ...draft, sort: e.target.value as ListingSort })}
        >
          <option value="newest">{t('sort_newest')}</option>
          <option value="price_asc">{t('sort_price_asc')}</option>
          <option value="price_desc">{t('sort_price_desc')}</option>
        </Select>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" className="flex-1" onClick={onClear}>
          {t('clear')}
        </Button>
        <Button className="flex-1" onClick={onApply}>
          {t('apply')}
        </Button>
      </div>
    </div>
  );
}
