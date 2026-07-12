// Mogadishu (Banaadir) district seed list — SPEC §10. Confirm the final set
// with pilot agencies before launch. Neighborhood (xaafad) stays free text.
export const MOGADISHU_DISTRICTS = [
  'Abdiaziz',
  'Bondhere',
  'Daynile',
  'Dharkenley',
  'Hamar Jajab',
  'Hamar Weyne',
  'Heliwa',
  'Hodan',
  'Howl Wadag',
  'Karan',
  'Kaxda',
  'Garasbaley',
  'Shangani',
  'Shibis',
  'Waberi',
  'Wadajir',
  'Warta Nabada',
  'Yaqshid',
] as const;
export type MogadishuDistrict = (typeof MOGADISHU_DISTRICTS)[number];
