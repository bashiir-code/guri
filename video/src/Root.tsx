import { Composition } from 'remotion';
import { GuriPromo, PROMO_DURATION } from './GuriPromo';
import { GuriTechReel, TECH_DURATION } from './TechReel';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="GuriPromo"
      component={GuriPromo}
      durationInFrames={PROMO_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
    <Composition
      id="GuriTechReel"
      component={GuriTechReel}
      durationInFrames={TECH_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  </>
);
