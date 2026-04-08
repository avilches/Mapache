import { useColorScheme } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';

export const solarizedDark = {
  name: 'dark' as const,
  // Bases
  bg:       '#002b36',
  bgAlt:    '#073642',
  bgPanel:  '#0d4050',
  // Content
  text:     '#839496',
  textBold: '#93a1a1',
  textSub:  '#657b83',
  // Accents
  yellow:   '#b58900',
  orange:   '#cb4b16',
  red:      '#dc322f',
  magenta:  '#d33682',
  violet:   '#6c71c4',
  blue:     '#268bd2',
  cyan:     '#2aa198',
  green:    '#859900',
  // UI
  border:   '#073642',
  card:     '#073642',
  cardBorder: '#0d4050',
  primary:   '#268bd2',
  onPrimary: '#ffffff',
  success:   '#859900',
  warning:   '#b58900',
  inactive:  '#586e75',
};

export const solarizedLight = {
  name: 'light' as const,
  bg:       '#fdf6e3',
  bgAlt:    '#eee8d5',
  bgPanel:  '#e0daca',
  text:     '#657b83',
  textBold: '#586e75',
  textSub:  '#839496',
  yellow:   '#b58900',
  orange:   '#cb4b16',
  red:      '#dc322f',
  magenta:  '#d33682',
  violet:   '#6c71c4',
  blue:     '#268bd2',
  cyan:     '#2aa198',
  green:    '#859900',
  border:   '#eee8d5',
  card:     '#ffffff',
  cardBorder: '#eee8d5',
  primary:   '#268bd2',
  onPrimary: '#ffffff',
  success:   '#859900',
  warning:   '#b58900',
  inactive:  '#93a1a1',
};

export const solarizedNeon = {
  name: 'dark' as const,
  bg:       '#011118',
  bgAlt:    '#021d26',
  bgPanel:  '#042a36',
  text:     '#9fb0b3',
  textBold: '#b8cccf',
  textSub:  '#6a8a8f',
  yellow:   '#e6b000',
  orange:   '#ff5a1f',
  red:      '#ff3a36',
  magenta:  '#ff40a0',
  violet:   '#8080ff',
  blue:     '#30aaff',
  cyan:     '#00d4c8',
  green:    '#a8c000',
  border:   '#042a36',
  card:     '#021d26',
  cardBorder: '#0a4558',
  primary:   '#00d4c8',
  onPrimary: '#ffffff',
  success:   '#a8c000',
  warning:   '#e6b000',
  inactive:  '#3a6068',
};

export type Theme = Omit<typeof solarizedDark, 'name'> & { name: 'dark' | 'light' };

export function useTheme(): Theme {
  const { themeMode } = useSettingsStore();
  const systemScheme = useColorScheme();

  if (themeMode === 'light') return solarizedLight;
  if (themeMode === 'dark') return solarizedDark;
  // system
  return systemScheme === 'dark' ? solarizedDark : solarizedLight;
}
