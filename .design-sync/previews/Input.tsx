import { Input, Label } from '@guri/web';

export const WithLabel = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="phone">Phone number</Label>
    <Input id="phone" type="tel" placeholder="+252 61 234 5678" />
  </div>
);

export const Filled = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="name">Full name</Label>
    <Input id="name" defaultValue="Aamina Xasan Cali" />
  </div>
);

export const Disabled = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="email-ro">Email</Label>
    <Input id="email-ro" type="email" defaultValue="aamina@example.com" disabled />
  </div>
);
