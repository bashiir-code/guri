import { Label, Textarea } from '@guri/web';

export const NoteToAgency = () => (
  <div className="grid w-96 gap-2">
    <Label htmlFor="note">Note to the agency</Label>
    <Textarea
      id="note"
      placeholder="Tell the agency when you are available for a viewing…"
      rows={4}
    />
  </div>
);

export const Filled = () => (
  <div className="grid w-96 gap-2">
    <Label htmlFor="desc">Property description</Label>
    <Textarea
      id="desc"
      rows={4}
      defaultValue="Bright two-bedroom apartment near Maka al-Mukarama road. Tiled floors, own water tank, backup power in the building."
    />
  </div>
);

export const Disabled = () => (
  <div className="grid w-96 gap-2">
    <Label htmlFor="locked">Agency notes</Label>
    <Textarea id="locked" rows={3} disabled defaultValue="Verified 12 May — originals seen." />
  </div>
);
