import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@guri/web';

export const ListingSummary = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Apartment on Maka al-Mukarama</CardTitle>
      <CardDescription>Hodan · 2 bedrooms · 1 bathroom</CardDescription>
    </CardHeader>
    <CardContent>
      <p className="font-display text-3xl font-extrabold text-forest">
        $350<span className="text-sm font-medium text-slate">/month</span>
      </p>
      <Button size="sm" className="mt-4">
        Request viewing
      </Button>
    </CardContent>
  </Card>
);

export const WelcomeCard = () => (
  <Card className="max-w-sm">
    <CardHeader>
      <CardTitle>Ku soo dhawoow Guri</CardTitle>
      <CardDescription>Kusii wad Google, ama isticmaal email iyo password</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <Button className="w-full">Gal</Button>
      <Button variant="outline" className="w-full">
        Samee akoon
      </Button>
    </CardContent>
  </Card>
);

export const PlainPanel = () => (
  <Card className="max-w-sm">
    <CardContent className="pt-6">
      <p className="text-sm text-muted-foreground">
        Every home on Guri is listed by a verified agency in Mogadishu.
      </p>
    </CardContent>
  </Card>
);
