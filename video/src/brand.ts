import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque';
import { loadFont as loadSans } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

// Guri design language (apps/web/tailwind.config.ts)
export const FOREST = '#173A31';
export const LIME = '#B7F35D';
export const MIST = '#F4F7F2';
export const SLATE = '#5C6B64';
export const AMBER = '#F2A93B';
export const MUTED = '#B9C9C1';
export const INK = '#0F2821'; // deeper Forest for code panels

export const display = loadDisplay('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily;
export const sans = loadSans('normal', { weights: ['400', '500', '600', '700', '800'], subsets: ['latin'] }).fontFamily;
export const mono = loadMono('normal', { weights: ['400', '700'], subsets: ['latin'] }).fontFamily;
