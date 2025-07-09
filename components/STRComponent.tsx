import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
  NativeModules
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Polyline } from 'react-native-svg';
import { Audio } from 'expo-av';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useBLE } from '../context/BLEContext';


const { RTLSDRModule } = NativeModules;

// === CONSTANTS ===
const SCREEN_CONFIG = {
  WIDTH: Dimensions.get('window').width,
  HEIGHT: 200,
} as const;

// Astronomical radio frequency configurations
const ASTRO_CONFIG = {
  JUPITER_FREQ_RANGE: { min: 10.0, max: 40.0 }, // MHz - Jupiter's decametric emissions
  JUPITER_S_BURSTS: { min: 18.0, max: 28.0 }, // MHz - S-burst range
  JUPITER_L_BURSTS: { min: 10.0, max: 15.0 }, // MHz - L-burst range
  SOLAR_RADIO: { min: 20.0, max: 200.0 }, // MHz - Solar radio bursts
  GALACTIC_NOISE: { min: 15.0, max: 30.0 }, // MHz - Galactic background
  SAMPLE_DURATION: 1.0, // seconds per audio sample
} as const;

const WATERFALL_CONFIG = {
  BUFFER_SIZE: 100,
  FFT_SIZE: 1024, // Increased for better frequency resolution
  SAMPLE_RATE: 2048000, // 2.048 MHz
  REFRESH_RATE: 20, // Reduced for astronomical signals
  INTENSITY_SCALE: 255,
  NOISE_FLOOR: 0.02, // Background noise threshold
} as const;

const AUDIO_CONFIG = {
  SAMPLE_RATE: 44100,
  BUFFER_SIZE: 8192, // Larger buffer for astronomical signals
  VOLUME_SCALE: 0.3,
  LOWPASS_CUTOFF: 8000, // Hz - Remove high frequency noise
  HIGHPASS_CUTOFF: 100, // Hz - Remove DC and very low frequencies
} as const;

const UI_COLORS = {
  BACKGROUND: '#1a1a1a',
  CONTROL_BG: '#2c2c2e',
  TEXT: '#e0e0e0',
  ACCENT: '#FF833A',
  CYAN: '#00ffff',
  WATERFALL_START: '#000000',
  WATERFALL_END: '#ffff00',
  SIGNAL_COLORS: ['#000000', '#330000', '#660000', '#990000', '#cc0000', '#ff0000', '#ff3300', '#ff6600', '#ff9900', '#ffcc00', '#ffff00'],
} as const;

// === TYPES ===
interface STRComponentProps {
  initialFrequency?: number;
  onDataReceived?: (samples: readonly number[]) => void;
  contextualStyling?: boolean;
  showControls?: boolean;
  targetPlanet?: 'jupiter' | 'saturn' | 'sun' | 'galactic';
}

interface WaterfallData {
  intensity: number[];
  timestamp: number;
}

interface AudioState {
  isPlaying: boolean;
  sound: Audio.Sound | null;
  isInitialized: boolean;
}

interface SDRState {
  frequency: number;
  isReceiving: boolean;
  waterfallBuffer: WaterfallData[];
  currentWaveform: number[];
}

// === UTILITY CLASSES ===
class AudioProcessor {
  private static previousPhase = 0;
  private static dcFilter = { x: 0, y: 0 };
  private static noiseReduction = { buffer: new Array(64).fill(0), index: 0 };
  private static agcGain = 1.0;

  // Remove AudioContext - not needed in React Native
  static async initializeAudio(): Promise<boolean> {
    try {
      // Just return true for React Native - audio initialization is handled by Expo Audio
      console.log('Audio processor initialized for React Native');
      return true;
    } catch (error) {
      console.error('Failed to initialize audio processor:', error);
      return false;
    }
  }

  // Enhanced DC blocking filter
  static dcBlock(input: number): number {
    const alpha = 0.999; // Very high-pass for astronomical signals
    this.dcFilter.y = alpha * (this.dcFilter.y + input - this.dcFilter.x);
    this.dcFilter.x = input;
    return this.dcFilter.y;
  }

  // Automatic Gain Control for weak astronomical signals
  static applyAGC(sample: number): number {
    const targetLevel = 0.1;
    const attack = 0.001;
    const release = 0.0001;
    
    const sampleLevel = Math.abs(sample);
    
    if (sampleLevel > targetLevel) {
      this.agcGain = Math.max(0.1, this.agcGain - attack);
    } else {
      this.agcGain = Math.min(10.0, this.agcGain + release);
    }
    
    return sample * this.agcGain;
  }

  // Noise reduction using moving average
  static reduceNoise(sample: number): number {
    this.noiseReduction.buffer[this.noiseReduction.index] = sample;
    this.noiseReduction.index = (this.noiseReduction.index + 1) % this.noiseReduction.buffer.length;
    
    // Calculate moving average
    const average = this.noiseReduction.buffer.reduce((sum, val) => sum + val, 0) / this.noiseReduction.buffer.length;
    
    // Subtract average (noise floor) and amplify
    return (sample - average) * 2.0;
  }

  // Simplified band-pass filter for React Native
  static bandPassFilter(samples: Float32Array, centerFreq: number, bandwidth: number): Float32Array {
    const filtered = new Float32Array(samples.length);
    
    try {
      // Simple IIR filter implementation
      const nyquist = AUDIO_CONFIG.SAMPLE_RATE / 2;
      const normalizedCenter = centerFreq / nyquist;
      const normalizedBandwidth = bandwidth / nyquist;
      
      // Simple filter coefficients
      const alpha = Math.exp(-2 * Math.PI * normalizedBandwidth);
      
      let y1 = 0, y2 = 0;
      
      for (let i = 0; i < samples.length; i++) {
        const x = samples[i] || 0;
        
        // Simple high-pass followed by low-pass
        const highPass = x - alpha * y1;
        const lowPass = highPass * alpha + (1 - alpha) * y2;
        
        filtered[i] = isNaN(lowPass) ? x : lowPass;
        y2 = y1;
        y1 = filtered[i];
      }
    } catch (error) {
      console.error('Filter error, using original samples:', error);
      return samples;
    }
    
    return filtered;
  }

  // Specialized I/Q processing for astronomical radio signals
  static processIQSamples(iSamples: number[], qSamples: number[], targetPlanet: string = 'jupiter'): Float32Array {
    const audioBuffer = new Float32Array(Math.min(iSamples.length, qSamples.length));
    
    for (let i = 0; i < audioBuffer.length; i++) {
      const I = iSamples[i] || 0;
      const Q = qSamples[i] || 0;
      
      let sample = 0;
      
      // Choose demodulation based on target
      if (targetPlanet === 'jupiter') {
        // Jupiter's decametric emissions - use AM detection for S-bursts
        const magnitude = Math.sqrt(I * I + Q * Q);
        sample = magnitude;
        
        // Enhance burst detection
        if (magnitude > WATERFALL_CONFIG.NOISE_FLOOR * 3) {
          sample *= 2.0; // Amplify strong signals (bursts)
        }
      } else if (targetPlanet === 'sun') {
        // Solar radio bursts - FM detection often better
        const currentPhase = Math.atan2(Q, I);
        let phaseDiff = currentPhase - this.previousPhase;
        
        // Handle phase wraparound
        while (phaseDiff > Math.PI) phaseDiff -= 2 * Math.PI;
        while (phaseDiff < -Math.PI) phaseDiff += 2 * Math.PI;
        
        sample = phaseDiff / Math.PI;
        this.previousPhase = currentPhase;
      } else {
        // General astronomical signals - AM detection
        sample = Math.sqrt(I * I + Q * Q);
      }
      
      // Apply signal processing chain
      sample = this.dcBlock(sample);
      sample = this.reduceNoise(sample);
      sample = this.applyAGC(sample);
      
      // Final clipping and scaling
      sample = Math.max(-1, Math.min(1, sample * AUDIO_CONFIG.VOLUME_SCALE));
      
      audioBuffer[i] = sample;
    }
    
    // Apply frequency-specific filtering
    let centerFreq = 2000; // Default center frequency in Hz
    let bandwidth = 4000;   // Default bandwidth in Hz
    
    switch (targetPlanet) {
      case 'jupiter':
        centerFreq = 1000; // Lower frequency for Jupiter's slow emissions
        bandwidth = 2000;
        break;
      case 'sun':
        centerFreq = 3000; // Higher frequency for solar bursts
        bandwidth = 6000;
        break;
      case 'galactic':
        centerFreq = 500;  // Very low frequency for galactic noise
        bandwidth = 1000;
        break;
    }
    
    return this.bandPassFilter(audioBuffer, centerFreq, bandwidth);
  }

  // Simplified WAV buffer creation
  static createWavBuffer(samples: Float32Array): ArrayBuffer {
    try {
      const bufferLength = samples.length * 2;
      const arrayBuffer = new ArrayBuffer(44 + bufferLength);
      const view = new DataView(arrayBuffer);

      // WAV header
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };

      writeString(0, 'RIFF');
      view.setUint32(4, 36 + bufferLength, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, AUDIO_CONFIG.SAMPLE_RATE, true);
      view.setUint32(28, AUDIO_CONFIG.SAMPLE_RATE * 2, true);
      view.setUint16(32, 2, true);
      view.setUint16(34, 16, true);
      writeString(36, 'data');
      view.setUint32(40, bufferLength, true);

      // Audio data
      for (let i = 0; i < samples.length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[i] || 0));
        const quantized = Math.round(sample * 32767);
        view.setInt16(44 + i * 2, quantized, true);
      }

      return arrayBuffer;
    } catch (error) {
      console.error('WAV buffer creation failed:', error);
      // Return minimal valid WAV buffer
      const minBuffer = new ArrayBuffer(44);
      const minView = new DataView(minBuffer);
      // Create minimal WAV header
      const bytes = new Uint8Array(minBuffer);
      const header = [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45];
      header.forEach((byte, index) => bytes[index] = byte);
      return minBuffer;
    }
  }

  // Enhanced Base64 conversion with better error handling
  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    try {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      
      // Process in smaller chunks to avoid call stack overflow
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        const chunkString = Array.from(chunk).map(byte => String.fromCharCode(byte)).join('');
        binary += chunkString;
      }
      
      // Use btoa if available, otherwise fallback
      if (typeof btoa !== 'undefined') {
        return btoa(binary);
      } else {
        // Manual base64 encoding for environments without btoa
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        for (let i = 0; i < binary.length; i += 3) {
          const a = binary.charCodeAt(i);
          const b = i + 1 < binary.length ? binary.charCodeAt(i + 1) : 0;
          const c = i + 2 < binary.length ? binary.charCodeAt(i + 2) : 0;
          
          const encoded = (a << 16) | (b << 8) | c;
          result += chars[(encoded >> 18) & 63];
          result += chars[(encoded >> 12) & 63];
          result += i + 1 < binary.length ? chars[(encoded >> 6) & 63] : '=';
          result += i + 2 < binary.length ? chars[encoded & 63] : '=';
        }
        return result;
      }
    } catch (error) {
      console.error('Base64 conversion failed:', error);
      return '';
    }
  }
}

class WaterfallRenderer {
  static generateIntensityData(samples: number[]): number[] {
    const fftSize = WATERFALL_CONFIG.FFT_SIZE;
    const intensities = new Array(fftSize).fill(0);
    
    // Simple power spectrum calculation
    for (let i = 0; i < Math.min(samples.length / 2, fftSize); i += 2) {
      const real = samples[i] || 0;
      const imag = samples[i + 1] || 0;
      const magnitude = Math.sqrt(real * real + imag * imag);
      intensities[i / 2] = Math.min(WATERFALL_CONFIG.INTENSITY_SCALE, magnitude * 10);
    }
    
    return intensities;
  }

  static generateWaterfallRects(waterfallBuffer: WaterfallData[], width: number, height: number): React.ReactElement[] {
    const lineHeight = height / WATERFALL_CONFIG.BUFFER_SIZE;
    const pixelWidth = width / WATERFALL_CONFIG.FFT_SIZE;
    const rects: React.ReactElement[] = [];
    
    waterfallBuffer.forEach((data, rowIndex) => {
      const y = rowIndex * lineHeight;
      
      data.intensity.forEach((intensity, colIndex) => {
        const x = colIndex * pixelWidth;
        const normalizedIntensity = intensity / WATERFALL_CONFIG.INTENSITY_SCALE;
        
        if (normalizedIntensity > 0.05) { // Only draw significant signals
          const colorIndex = Math.floor(normalizedIntensity * (UI_COLORS.SIGNAL_COLORS.length - 1));
          const color = UI_COLORS.SIGNAL_COLORS[Math.min(colorIndex, UI_COLORS.SIGNAL_COLORS.length - 1)];
          
          rects.push(
            <Rect
              key={`${rowIndex}-${colIndex}`}
              x={x}
              y={y}
              width={pixelWidth}
              height={lineHeight}
              fill={color}
              opacity={normalizedIntensity}
            />
          );
        }
      });
    });
    
    return rects;
  }

  static generateWaveformPath(waveformData: number[], width: number, height: number): string {
    if (!waveformData.length) return '';
    
    const stepX = width / waveformData.length;
    let pathData = `M 0 ${height / 2}`;
    
    waveformData.forEach((amplitude, index) => {
      const x = index * stepX;
      const y = height / 2 - (amplitude / WATERFALL_CONFIG.INTENSITY_SCALE) * height / 2;
      pathData += ` L ${x} ${y}`;
    });
    
    return pathData;
  }

  static generateWaveformPoints(waveformData: number[], width: number, height: number): string {
    if (!waveformData.length) return '';
    
    const stepX = width / waveformData.length;
    const points: string[] = [];
    
    waveformData.forEach((amplitude, index) => {
      const x = index * stepX;
      const y = height / 2 - (amplitude / WATERFALL_CONFIG.INTENSITY_SCALE) * height / 2;
      points.push(`${x},${y}`);
    });
    
    return points.join(' ');
  }
}

// Mock data generator for demonstration
class MockDataGenerator {
  private static time = 0;
  private static burstProbability = 0.02; // 2% chance of burst per sample
  private static lastBurstTime = 0;
  
  static generateAstronomicalSamples(targetPlanet: string = 'jupiter'): number[] {
    const samples = new Array(WATERFALL_CONFIG.FFT_SIZE * 2);
    const currentTime = Date.now();
    
    for (let i = 0; i < samples.length; i += 2) {
      // Base galactic noise
      const galacticNoise = (Math.random() - 0.5) * 0.05;
      
      let signalI = galacticNoise;
      let signalQ = galacticNoise;
      
      if (targetPlanet === 'jupiter') {
        // Jupiter's decametric emissions simulation
        // S-bursts: Short, intense bursts
        if (Math.random() < this.burstProbability && currentTime - this.lastBurstTime > 5000) {
          const burstAmplitude = 0.8 + Math.random() * 0.4;
          const burstFreq = 0.1 + Math.random() * 0.1; // Low frequency burst
          const burstPhase = this.time * burstFreq * Math.PI * 2;
          
          signalI += Math.sin(burstPhase) * burstAmplitude;
          signalQ += Math.cos(burstPhase) * burstAmplitude * 0.7;
          
          this.lastBurstTime = currentTime;
        }
        
        // L-bursts: Longer duration, lower amplitude
        const lBurstFreq = 0.05;
        const lBurstPhase = this.time * lBurstFreq * Math.PI * 2;
        const lBurstAmplitude = 0.15 * (1 + Math.sin(this.time * 0.01));
        
        signalI += Math.sin(lBurstPhase) * lBurstAmplitude;
        signalQ += Math.cos(lBurstPhase) * lBurstAmplitude;
        
      } else if (targetPlanet === 'sun') {
        // Solar radio bursts - more frequent, different characteristics
        const solarFreq = 0.2 + Math.random() * 0.1;
        const solarPhase = this.time * solarFreq * Math.PI * 2;
        const solarAmplitude = 0.3 * (1 + Math.sin(this.time * 0.05));
        
        signalI += Math.sin(solarPhase) * solarAmplitude;
        signalQ += Math.sin(solarPhase + Math.PI/4) * solarAmplitude;
        
      } else if (targetPlanet === 'galactic') {
        // Galactic background radiation
        const galacticFreq = 0.02;
        const galacticPhase = this.time * galacticFreq * Math.PI * 2;
        const galacticAmplitude = 0.1;
        
        signalI += Math.sin(galacticPhase) * galacticAmplitude;
        signalQ += Math.cos(galacticPhase) * galacticAmplitude;
      }
      
      samples[i] = signalI;
      samples[i + 1] = signalQ;
      
      this.time += 1 / WATERFALL_CONFIG.SAMPLE_RATE;
    }
    
    return samples;
  }
}

// RTL-SDR Data Processor for real hardware integration
class RTLSDRDataProcessor {
  private static deviceHandle: number | null = null;
  private static isInitialized: boolean = false;

  static async initialize(): Promise<boolean> {
    try {
      if (this.isInitialized && this.deviceHandle !== null) {
        return true;
      }

      if (!RTLSDRModule) {
        console.warn('RTL-SDR module not available');
        return false;
      }

      // Initialize the SDR
      const initResult = await RTLSDRModule.initializeSDR();
      if (!initResult) {
        console.error('Failed to initialize RTL-SDR');
        return false;
      }

      // Get device count
      const deviceCount = await RTLSDRModule.getDeviceCount();
      if (deviceCount <= 0) {
        console.error('No RTL-SDR devices found');
        return false;
      }

      // Open the first device
      const handle = await RTLSDRModule.openDevice(0);
      if (handle < 0) {
        console.error('Failed to open RTL-SDR device');
        return false;
      }

      this.deviceHandle = handle;
      this.isInitialized = true;

      // Set default parameters
      await RTLSDRModule.setSampleRate(handle, WATERFALL_CONFIG.SAMPLE_RATE);
      await RTLSDRModule.setFrequency(handle, 20.1 * 1000000); // 20.1 MHz
      await RTLSDRModule.resetBuffer(handle);

      console.log('RTL-SDR initialized successfully with handle:', handle);
      return true;
    } catch (error) {
      console.error('RTL-SDR initialization error:', error);
      return false;
    }
  }

  static async readSamples(): Promise<number[]> {
    try {
      // Ensure device is initialized
      if (!this.isInitialized || this.deviceHandle === null) {
        const initSuccess = await this.initialize();
        if (!initSuccess) {
          console.warn('RTL-SDR not available, using mock data');
          return MockDataGenerator.generateAstronomicalSamples();
        }
      }

      if (RTLSDRModule && RTLSDRModule.readSamples && this.deviceHandle !== null) {
        // Use the correct method signature: readSamples(handle, bufferSize)
        const samples = await RTLSDRModule.readSamples(this.deviceHandle, WATERFALL_CONFIG.FFT_SIZE * 2);
        return samples || [];
      } else {
        console.warn('RTL-SDR module not available, using mock data');
        return MockDataGenerator.generateAstronomicalSamples();
      }
    } catch (error) {
      console.error('RTL-SDR read error, falling back to mock data:', error);
      return MockDataGenerator.generateAstronomicalSamples();
    }
  }

  static async setFrequency(frequency: number): Promise<boolean> {
    try {
      if (this.deviceHandle !== null && RTLSDRModule && RTLSDRModule.setFrequency) {
        const result = await RTLSDRModule.setFrequency(this.deviceHandle, frequency * 1000000);
        return result === 0; // RTL-SDR returns 0 on success
      }
      return false;
    } catch (error) {
      console.error('RTL-SDR frequency set error:', error);
      return false;
    }
  }

  static async cleanup(): Promise<void> {
    try {
      if (this.deviceHandle !== null && RTLSDRModule && RTLSDRModule.closeDevice) {
        await RTLSDRModule.closeDevice(this.deviceHandle);
        this.deviceHandle = null;
        this.isInitialized = false;
        console.log('RTL-SDR cleaned up');
      }
    } catch (error) {
      console.error('RTL-SDR cleanup error:', error);
    }
  }
}

// === MAIN COMPONENT ===
const STRComponent: React.FC<STRComponentProps> = ({
  initialFrequency = 20.1, // Default to Jupiter frequency range
  onDataReceived,
  contextualStyling = true,
  showControls = true,
  targetPlanet = 'jupiter',
}) => {
  const { connectedDevice } = useBLE();
  
  const [sdrState, setSdrState] = useState<SDRState>({
    frequency: initialFrequency,
    isReceiving: false,
    waterfallBuffer: [],
    currentWaveform: new Array(WATERFALL_CONFIG.FFT_SIZE).fill(0),
  });

  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    sound: null,
    isInitialized: false,
  });

  const isMountedRef = useRef(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // === AUDIO MANAGEMENT ===
  const initializeAudio = useCallback(async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      
      // Use the simplified audio processor initialization
      const audioReady = await AudioProcessor.initializeAudio();
      if (!audioReady) {
        throw new Error('Audio processor initialization failed');
      }
      
      setAudioState(prev => ({ ...prev, isInitialized: true }));
      console.log('Audio system initialized successfully');
    } catch (error) {
      console.error('Audio initialization failed:', error);
      Alert.alert('Audio Error', 'Failed to initialize audio system. Audio playback will be disabled.');
      // Still mark as initialized to allow visual operation
      setAudioState(prev => ({ ...prev, isInitialized: true }));
    }
  }, []);

  const playAudioFromSamples = useCallback(async (samples: number[]) => {
    if (!audioState.isInitialized || !audioState.isPlaying || samples.length < 4) return;

    try {
      // Clean up previous sound with timeout
      if (audioState.sound) {
        try {
          await Promise.race([
            audioState.sound.unloadAsync(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
          ]);
        } catch (error) {
          console.warn('Previous sound cleanup failed:', error);
        }
      }

      // Separate I/Q samples with validation
      const iSamples = samples.filter((_, index) => index % 2 === 0);
      const qSamples = samples.filter((_, index) => index % 2 === 1);
      
      if (iSamples.length === 0 || qSamples.length === 0) {
        console.warn('No valid I/Q samples found');
        return;
      }
      
      // Process I/Q samples with planet-specific demodulation
      const audioBuffer = AudioProcessor.processIQSamples(iSamples, qSamples, targetPlanet);
      
      if (audioBuffer.length === 0) {
        console.warn('Audio processing produced no output');
        return;
      }
      
      // Create WAV buffer
      const wavBuffer = AudioProcessor.createWavBuffer(audioBuffer);
      const base64Audio = AudioProcessor.arrayBufferToBase64(wavBuffer);
      
      if (!base64Audio) {
        console.warn('Failed to create audio data');
        return;
      }
      
      const uri = `data:audio/wav;base64,${base64Audio}`;

      // Create and play audio with settings optimized for astronomical signals
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { 
          shouldPlay: true, 
          isLooping: false, 
          volume: 0.9,
          rate: 1.0,
          shouldCorrectPitch: false,
        }
      );

      // Set up playback status listener
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          newSound.unloadAsync().catch(console.error);
        }
      });

      if (isMountedRef.current) {
        setAudioState(prev => ({ ...prev, sound: newSound }));
      } else {
        await newSound.unloadAsync();
      }
    } catch (error) {
      console.error('Astronomical audio playback error:', error);
    }
  }, [audioState.isInitialized, audioState.isPlaying, audioState.sound, targetPlanet]);

  // === SDR DATA PROCESSING ===
  const processSDRData = useCallback(async () => {
    if (!sdrState.isReceiving) return;

    try {
      // Use actual RTL-SDR data with fallback to mock data
      const rawData = await RTLSDRDataProcessor.readSamples();
      if (!rawData || rawData.length < 4 || !isMountedRef.current) return;

      // Generate waterfall intensity data
      const intensityData = WaterfallRenderer.generateIntensityData(rawData);
      
      // Update waveform for real-time display
      const newWaveform = intensityData.slice(0, WATERFALL_CONFIG.FFT_SIZE);
      
      // Add to waterfall buffer (circular buffer)
      setSdrState(prev => {
        const newWaterfallData: WaterfallData = {
          intensity: intensityData,
          timestamp: Date.now(),
        };
        
        const newBuffer = [...prev.waterfallBuffer, newWaterfallData];
        if (newBuffer.length > WATERFALL_CONFIG.BUFFER_SIZE) {
          newBuffer.shift();
        }
        
        return {
          ...prev,
          waterfallBuffer: newBuffer,
          currentWaveform: newWaveform,
        };
      });

      // Play audio if enabled
      if (audioState.isPlaying) {
        await playAudioFromSamples(rawData);
      }

      // Notify parent component
      if (onDataReceived) {
        onDataReceived(rawData);
      }
    } catch (error) {
      console.error('SDR data processing error:', error);
      // Fallback to mock data on error
      try {
        const fallbackData = MockDataGenerator.generateAstronomicalSamples(targetPlanet);
        if (fallbackData && fallbackData.length >= 4 && isMountedRef.current) {
          const intensityData = WaterfallRenderer.generateIntensityData(fallbackData);
          const newWaveform = intensityData.slice(0, WATERFALL_CONFIG.FFT_SIZE);
          
          setSdrState(prev => {
            const newWaterfallData: WaterfallData = {
              intensity: intensityData,
              timestamp: Date.now(),
            };
            
            const newBuffer = [...prev.waterfallBuffer, newWaterfallData];
            if (newBuffer.length > WATERFALL_CONFIG.BUFFER_SIZE) {
              newBuffer.shift();
            }
            
            return {
              ...prev,
              waterfallBuffer: newBuffer,
              currentWaveform: newWaveform,
            };
          });

          if (audioState.isPlaying) {
            await playAudioFromSamples(fallbackData);
          }

          if (onDataReceived) {
            onDataReceived(fallbackData);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback data generation failed:', fallbackError);
      }
    }
  }, [sdrState.isReceiving, audioState.isPlaying, playAudioFromSamples, onDataReceived, targetPlanet]);

  // === CONTROL HANDLERS ===
  const handlePlayPause = useCallback(async () => {
    if (!audioState.isInitialized) {
      await initializeAudio();
      return;
    }

    // Initialize RTL-SDR when starting
    if (!sdrState.isReceiving) {
      try {
        const rtlsdrReady = await RTLSDRDataProcessor.initialize();
        if (rtlsdrReady) {
          console.log('RTL-SDR ready for receiving');
        } else {
          console.warn('RTL-SDR not available, will use mock data');
        }
      } catch (error) {
        console.error('RTL-SDR initialization failed:', error);
      }
    }

    setAudioState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    setSdrState(prev => ({ ...prev, isReceiving: !prev.isReceiving }));
  }, [audioState.isInitialized, initializeAudio, sdrState.isReceiving]);

  const handleStop = useCallback(async () => {
    // Stop audio
    if (audioState.sound) {
      try {
        await audioState.sound.stopAsync();
        await audioState.sound.unloadAsync();
      } catch (error) {
        console.error('Stop error:', error);
      }
    }

    // Cleanup RTL-SDR
    await RTLSDRDataProcessor.cleanup();

    setAudioState(prev => ({
      ...prev,
      isPlaying: false,
      sound: null,
    }));
    
    setSdrState(prev => ({
      ...prev,
      isReceiving: false,
      waterfallBuffer: [],
      currentWaveform: new Array(WATERFALL_CONFIG.FFT_SIZE).fill(0),
    }));
  }, [audioState.sound]);

  // Update frequency when changed
  useEffect(() => {
    if (sdrState.isReceiving) {
      RTLSDRDataProcessor.setFrequency(initialFrequency);
    }
  }, [initialFrequency, sdrState.isReceiving]);

  // === RENDERING HELPERS ===
  const waterfallRects = useMemo(() => {
    return WaterfallRenderer.generateWaterfallRects(
      sdrState.waterfallBuffer,
      SCREEN_CONFIG.WIDTH,
      SCREEN_CONFIG.HEIGHT * 0.8
    );
  }, [sdrState.waterfallBuffer]);

  const waveformPath = useMemo(() => {
    return WaterfallRenderer.generateWaveformPath(
      sdrState.currentWaveform,
      SCREEN_CONFIG.WIDTH,
      SCREEN_CONFIG.HEIGHT * 0.2
    );
  }, [sdrState.currentWaveform]);

  const waveformPoints = useMemo(() => {
    return WaterfallRenderer.generateWaveformPoints(
      sdrState.currentWaveform,
      SCREEN_CONFIG.WIDTH,
      SCREEN_CONFIG.HEIGHT * 0.2
    );
  }, [sdrState.currentWaveform]);

  // === LIFECYCLE ===
  useEffect(() => {
    initializeAudio();
    
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioState.sound) {
        audioState.sound.unloadAsync().catch(console.error);
      }
    };
  }, [initializeAudio]);

  useEffect(() => {
    if (sdrState.isReceiving) {
      // Slower refresh rate for astronomical signals
      intervalRef.current = setInterval(processSDRData, 1000 / WATERFALL_CONFIG.REFRESH_RATE);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [sdrState.isReceiving, processSDRData]);

  // Update frequency from props
  useEffect(() => {
    setSdrState(prev => ({ ...prev, frequency: initialFrequency }));
  }, [initialFrequency]);

  // === RENDER ===
  return (
    <View style={[styles.container, contextualStyling && styles.contextualContainer]}>
      {/* Frequency Display with Target Planet */}
      <View style={styles.frequencyDisplay}>
        <Text style={styles.frequencyText}>
          {sdrState.frequency.toFixed(3)} MHz
        </Text>
        <Text style={styles.targetText}>
          TARGET: {targetPlanet.toUpperCase()}
        </Text>
        <View style={[styles.statusIndicator, { 
          backgroundColor: sdrState.isReceiving ? UI_COLORS.CYAN : '#666' 
        }]} />
      </View>

      {/* Waterfall + Waveform Canvas */}
      <View style={styles.canvasContainer}>
        <Svg width={SCREEN_CONFIG.WIDTH} height={SCREEN_CONFIG.HEIGHT} style={styles.canvas}>
          {/* Remove Defs and LinearGradient - use solid colors instead */}
          
          {/* Waterfall Background - using solid color instead of gradient */}
          <Rect 
            x={0} 
            y={0} 
            width={SCREEN_CONFIG.WIDTH} 
            height={SCREEN_CONFIG.HEIGHT * 0.8}
            fill={UI_COLORS.BACKGROUND}
            opacity={0.8}
          />
          
          {/* Waterfall Data */}
          {waterfallRects}
          
          {/* Waveform Overlay */}
          {waveformPoints && (
            <Polyline
              points={waveformPoints}
              fill="none"
              stroke={UI_COLORS.CYAN}
              strokeWidth={2}
              transform={`translate(0, ${SCREEN_CONFIG.HEIGHT * 0.8})`}
            />
          )}
        </Svg>
      </View>

      {/* Controls */}
      {showControls && (
        <View style={[styles.controls, contextualStyling && styles.contextualControls]}>
          <TouchableOpacity
            style={styles.controlButton}
            onPress={handlePlayPause}
            accessibilityLabel={audioState.isPlaying ? "Pause SDR" : "Start SDR"}
          >
            <Ionicons
              name={audioState.isPlaying ? "pause" : "play"}
              size={20}
              color={UI_COLORS.TEXT}
            />
            <Text style={styles.controlText}>
              {audioState.isPlaying ? "PAUSE" : "START"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlButton}
            onPress={handleStop}
            accessibilityLabel="Stop SDR"
          >
            <MaterialIcons name="stop" size={20} color={UI_COLORS.TEXT} />
            <Text style={styles.controlText}>STOP</Text>
          </TouchableOpacity>

          <View style={styles.statusText}>
            <Text style={styles.statusLabel}>
              STATUS: {sdrState.isReceiving ? 'RECEIVING' : 'IDLE'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: SCREEN_CONFIG.WIDTH - 20,
    height: SCREEN_CONFIG.HEIGHT + 60,
    backgroundColor: UI_COLORS.BACKGROUND,
    borderRadius: 25,
    overflow: 'hidden',
    
  },
  contextualContainer: {
    marginVertical: 10,
    borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.2)",
  },
  frequencyDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
 
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  frequencyText: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace', // Changed from 'Shantell' to a more common font
  },
  targetText: {
    color: UI_COLORS.CYAN,
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
  },
  canvas: {
    width: SCREEN_CONFIG.WIDTH,
    height: SCREEN_CONFIG.HEIGHT,
  },
  controls: {
     flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: UI_COLORS.CONTROL_BG,
  },
  contextualControls: {
    borderTopWidth: 1,
    borderTopColor: UI_COLORS.ACCENT,
  },
  controlButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: UI_COLORS.ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 5,
  },
  controlText: {
    color: UI_COLORS.TEXT,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusText: {
    flex: 1,
    alignItems: 'center',
  },
  statusLabel: {
    color: UI_COLORS.TEXT,
    fontSize: 11,
    opacity: 0.8,
  },
});

export default STRComponent;