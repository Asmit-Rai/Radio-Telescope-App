import { Dimensions } from 'react-native';

export const SCREEN_WIDTH = Dimensions.get('window').width;
export const MIN_FREQUENCY = 10.0;
export const MAX_FREQUENCY = 2000.0;
export const FINE_FREQUENCY_STEP = 0.01;
export const COARSE_FREQUENCY_STEP = 1.0;
export const SAMPLE_RATE = 44100;
export const ALTITUDE_STEP = 1.0;
export const AZIMUTH_STEP = 1.0;
export const DPAD_SIZE = 180;
export const ARM_THICKNESS = DPAD_SIZE * 0.4;
export const ACCENT_COLOR_ORANGE = '#FF833A';
export const OUTLINE_COLOR_BLUE = '#121212';