import { Label, Select } from '@guri/web';

export const DistrictSelect = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="district">District</Label>
    <Select id="district" defaultValue="hodan">
      <option value="">All districts</option>
      <option value="hodan">Hodan</option>
      <option value="wadajir">Wadajir</option>
      <option value="hamarweyne">Hamarweyne</option>
      <option value="shangani">Shangani</option>
    </Select>
  </div>
);

export const SortOrder = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="sort">Sort by</Label>
    <Select id="sort" defaultValue="newest">
      <option value="newest">Newest first</option>
      <option value="price_asc">Price: low to high</option>
      <option value="price_desc">Price: high to low</option>
    </Select>
  </div>
);

export const Disabled = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="type-d">Property type</Label>
    <Select id="type-d" disabled defaultValue="apartment">
      <option value="apartment">Apartment</option>
    </Select>
  </div>
);
