import { Button } from '@guri/web';

export const Variants = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Daawo guryaha</Button>
    <Button variant="outline">Samee akoon</Button>
    <Button variant="ghost">Nadiifi</Button>
  </div>
);

export const Sizes = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button size="lg">Request viewing</Button>
    <Button>Browse homes</Button>
    <Button size="sm">Apply filters</Button>
  </div>
);

export const States = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>Confirm booking</Button>
    <Button disabled>Confirm booking</Button>
    <Button variant="outline" disabled>
      Cancel
    </Button>
  </div>
);

export const FullWidth = () => (
  <div className="w-72 space-y-3">
    <Button className="w-full">Gal</Button>
    <Button variant="outline" className="w-full">
      Samee akoon
    </Button>
  </div>
);
