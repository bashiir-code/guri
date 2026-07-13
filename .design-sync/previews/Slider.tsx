import { Label, Slider } from '@guri/web';

export const RentRange = () => (
  <div className="w-80">
    <div className="mb-1 flex items-center justify-between">
      <Label>Rent (USD/month)</Label>
      <span className="text-sm font-semibold text-forest">$150 – $600</span>
    </div>
    <Slider defaultValue={[150, 600]} min={0} max={1000} step={25} />
    <div className="mt-1 flex justify-between text-xs text-slate">
      <span>$0</span>
      <span>$1000+</span>
    </div>
  </div>
);

export const SingleValue = () => (
  <div className="w-80">
    <Label className="mb-2 block">Minimum bedrooms</Label>
    <Slider defaultValue={[2]} min={0} max={5} step={1} />
  </div>
);
