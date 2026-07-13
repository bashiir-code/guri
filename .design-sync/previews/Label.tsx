import { Input, Label, Textarea } from '@guri/web';

export const FieldLabel = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="email">Email address</Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>
);

export const OnTextarea = () => (
  <div className="grid w-80 gap-2">
    <Label htmlFor="msg">Message to the agency</Label>
    <Textarea id="msg" placeholder="Salaan — I would like to view this home…" rows={3} />
  </div>
);
