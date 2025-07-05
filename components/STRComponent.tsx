import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Polyline } from 'react-native-svg';
import { Audio } from 'expo-av';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useBLE } from '../context/BLEContext';

// === CONSTANTS ===
const SCREEN_CONFIG = {
  WIDTH: Dimensions.get('window').width,
  HEIGHT: 200,
} as const;

const WATERFALL_CONFIG = {
  BUFFER_SIZE: 100,
  FFT_SIZE: 512,
  SAMPLE_RATE: 2048000, // 2.048 MHz
  REFRESH_RATE: 30, // FPS
  INTENSITY_SCALE: 255,
} as const;

const AUDIO_CONFIG = {
  SAMPLE_RATE: 44100,
  BUFFER_SIZE: 4096,
  VOLUME_SCALE: 0.5,
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
  private static context: AudioContext | null = null;
  private static workletLoaded = false;

  static async initializeAudio(): Promise<AudioContext> {
    if (!this.context) {
      // @ts-ignore - Web Audio API not fully typed in RN
      this.context = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: AUDIO_CONFIG.SAMPLE_RATE,
      });
    }
    return this.context;
  }

  static processIQSamples(iSamples: number[], qSamples: number[]): Float32Array {
    const audioBuffer = new Float32Array(iSamples.length);
    
    for (let i = 0; i < iSamples.length; i++) {
      // Convert I/Q to audio using AM demodulation
      const amplitude = Math.sqrt(iSamples[i] * iSamples[i] + qSamples[i] * qSamples[i]);
      audioBuffer[i] = amplitude * AUDIO_CONFIG.VOLUME_SCALE;
    }
    
    return audioBuffer;
  }

  static createWavBuffer(samples: Float32Array): ArrayBuffer {
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
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(44 + i * 2, sample * 0x7FFF, true);
    }

    return arrayBuffer;
  }

  static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
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
  private static noiseLevel = 0.1;
  private static signalFreqs = [0.2, 0.35, 0.7]; // Normalized frequency positions
  
  static generateMockSamples(): number[] {
    const samples = new Array(WATERFALL_CONFIG.FFT_SIZE * 2);
    
    for (let i = 0; i < samples.length; i += 2) {
      // Add noise
      const noise = (Math.random() - 0.5) * this.noiseLevel;
      
      // Add signals at specific frequencies
      let signal = 0;
      this.signalFreqs.forEach(freq => {
        const phase = (i / 2) * freq * Math.PI * 2;
        signal += Math.sin(phase) * 0.3;
      });
      
      samples[i] = noise + signal; // I component
      samples[i + 1] = noise + signal * 0.8; // Q component
    }
    
    return samples;
  }
}

// === MAIN COMPONENT ===
const STRComponent: React.FC<STRComponentProps> = ({
  initialFrequency = 98.1,
  onDataReceived,
  contextualStyling = true,
  showControls = true,
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
      
      setAudioState(prev => ({ ...prev, isInitialized: true }));
    } catch (error) {
      console.error('Audio initialization failed:', error);
      Alert.alert('Audio Error', 'Failed to initialize audio system');
    }
  }, []);

  const playAudioFromSamples = useCallback(async (samples: number[]) => {
    if (!audioState.isInitialized || !audioState.isPlaying || samples.length < 2) return;

    try {
      // Clean up previous sound
      if (audioState.sound) {
        await audioState.sound.unloadAsync();
      }

      // Process I/Q samples
      const iSamples = samples.filter((_, index) => index % 2 === 0);
      const qSamples = samples.filter((_, index) => index % 2 === 1);
      const audioBuffer = AudioProcessor.processIQSamples(iSamples, qSamples);
      
      // Create WAV and play
      const wavBuffer = AudioProcessor.createWavBuffer(audioBuffer);
      const base64Audio = AudioProcessor.arrayBufferToBase64(wavBuffer);
      const uri = `data:audio/wav;base64,${base64Audio}`;

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: false, volume: 1.0 }
      );

      if (isMountedRef.current) {
        setAudioState(prev => ({ ...prev, sound: newSound }));
      } else {
        await newSound.unloadAsync();
      }
    } catch (error) {
      console.error('Audio playback error:', error);
    }
  }, [audioState.isInitialized, audioState.isPlaying, audioState.sound]);

  // === SDR DATA PROCESSING ===
  const processSDRData = useCallback(async () => {
    if (!sdrState.isReceiving) return;

    try {
      // Use mock data for now - replace with actual SDR data when available
      const rawData = MockDataGenerator.generateMockSamples();
      if (!rawData || !rawData.length || !isMountedRef.current) return;

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
    }
  }, [sdrState.isReceiving, audioState.isPlaying, playAudioFromSamples, onDataReceived]);

  // === CONTROL HANDLERS ===
  const handlePlayPause = useCallback(async () => {
    if (!audioState.isInitialized) {
      await initializeAudio();
      return;
    }

    setAudioState(prev => ({ ...prev, isPlaying: !prev.isPlaying }));
    setSdrState(prev => ({ ...prev, isReceiving: !prev.isReceiving }));
  }, [audioState.isInitialized, initializeAudio]);

  const handleStop = useCallback(async () => {
    if (audioState.sound) {
      try {
        await audioState.sound.stopAsync();
        await audioState.sound.unloadAsync();
      } catch (error) {
        console.error('Stop error:', error);
      }
    }

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
      {/* Frequency Display */}
      <View style={styles.frequencyDisplay}>
        <Text style={styles.frequencyText}>
          {sdrState.frequency.toFixed(3)} MHz
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
    width: SCREEN_CONFIG.WIDTH,
    height: SCREEN_CONFIG.HEIGHT + 60,
    backgroundColor: UI_COLORS.BACKGROUND,
    borderRadius: 8,
    overflow: 'hidden',
  },
  contextualContainer: {
    marginVertical: 10,
    borderWidth: 1,
    borderColor: UI_COLORS.ACCENT,
  },
  frequencyDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: UI_COLORS.CONTROL_BG,
  },
  frequencyText: {
    color: UI_COLORS.ACCENT,
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace', // Changed from 'Shantell' to a more common font
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