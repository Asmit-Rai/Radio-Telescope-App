import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  SafeAreaView,
  PanResponder,
  TextInput,
  Modal,
} from "react-native";
import {
  Ionicons,
  FontAwesome5,
  MaterialIcons,
  AntDesign,
} from "@expo/vector-icons";
import { Audio } from "expo-av";
import { router } from "expo-router";
import { useBLE } from "../../../context/BLEContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { debounce } from "lodash";
import RTLSDRComponent from "../../../components/RTLSDRComponent";

// === CONSTANTS ===
const SCREEN_CONFIG = {
  WIDTH: Dimensions.get("window").width,
  HEIGHT: Dimensions.get("window").height,
} as const;

const FREQUENCY_CONFIG = {
  MIN: 10.0,
  MAX: 2000.0,
  FINE_STEP: 0.01,
  COARSE_STEP: 1.0,
  PRECISION: 3,
} as const;

const CONTROL_CONFIG = {
  ALTITUDE_STEP: 1.0,
  AZIMUTH_STEP: 1.0,
  ALTITUDE_MIN: 0,
  ALTITUDE_MAX: 180,
  AZIMUTH_MIN: 0,
  AZIMUTH_MAX: 360,
  LONG_PRESS_INTERVAL: 150,
  DEBOUNCE_DELAY: 1000,
} as const;

const AUDIO_CONFIG = {
  SAMPLE_RATE: 44100,
  WAVEFORM_POINTS: 100,
  VOLUME_MAX: 32767,
} as const;

const UI_CONFIG = {
  DPAD_SIZE: 180,
  ARM_THICKNESS: 180 * 0.4,
  ACCENT_COLOR: "#FF833A",
  OUTLINE_COLOR: "#121212",
  SUCCESS_COLOR: "#34C759",
  ERROR_COLOR: "#FF3B30",
  WARNING_COLOR: "#FF9F0A",
} as const;

const STORAGE_KEYS = {
  DEVICE_NAME: "connected_device_name",
  SAVED_SIGNALS: "savedSignals",
} as const;

const MONITORING_CONFIG = {
  CONNECTION_CHECK_INTERVAL: 30000,
  BATTERY_UPDATE_INTERVAL: 5000,
  SIGNAL_STRENGTH_THRESHOLD: {
    EXCELLENT: -70,
    GOOD: -85,
  },
} as const;

// === TYPES ===
interface WaveformProps {
  data: readonly number[];
  cursorPosition: CursorPosition;
  onCursorMove: (position: CursorPosition) => void;
}

interface SavedSignal {
  readonly id: string;
  readonly name: string;
  readonly frequency: number;
  readonly altitude: number;
  readonly azimuth: number;
  readonly audioBase64?: string;
  readonly timestamp: number;
}

interface CursorPosition {
  readonly x: number;
  readonly y: number;
}

interface ControlState {
  readonly altitude: number;
  readonly azimuth: number;
  readonly frequency: number;
}

interface ConnectionStatus {
  readonly isConnected: boolean | null;
  readonly signalStrength: number | null;
  readonly deviceName: string;
  readonly battery: number;
}

interface AudioState {
  readonly isPlaying: boolean;
  readonly isRecording: boolean;
  readonly sound: Audio.Sound | null;
  readonly waveformData: readonly number[];
}

interface ModalState {
  readonly isSaveModalVisible: boolean;
  readonly isFindModalVisible: boolean;
  readonly signalName: string;
  readonly findAltitude: string;
  readonly findAzimuth: string;
}

type SignalQuality = 'Excellent' | 'Good' | 'Weak' | 'Unknown';

// === UTILITY CLASSES ===
class ValidationUtil {
  static validateFrequency(frequency: number): boolean {
    return typeof frequency === 'number' && 
           !isNaN(frequency) && 
           frequency >= FREQUENCY_CONFIG.MIN && 
           frequency <= FREQUENCY_CONFIG.MAX;
  }

  static validateAltitude(altitude: number): boolean {
    return typeof altitude === 'number' && 
           !isNaN(altitude) && 
           altitude >= CONTROL_CONFIG.ALTITUDE_MIN && 
           altitude <= CONTROL_CONFIG.ALTITUDE_MAX;
  }

  static validateAzimuth(azimuth: number): boolean {
    return typeof azimuth === 'number' && 
           !isNaN(azimuth) && 
           azimuth >= CONTROL_CONFIG.AZIMUTH_MIN && 
           azimuth <= CONTROL_CONFIG.AZIMUTH_MAX;
  }

  static validateSignalName(name: string): boolean {
    return typeof name === 'string' && name.trim().length > 0 && name.trim().length <= 50;
  }

  static sanitizeNumber(value: number, min: number, max: number, precision: number = 1): number {
    const sanitized = Math.max(min, Math.min(max, value));
    return Math.round(sanitized * Math.pow(10, precision)) / Math.pow(10, precision);
  }

  static generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

class AudioProcessor {
  private static createWavBuffer(samples: Int16Array, sampleRate: number): ArrayBuffer {
    const bufferLength = samples.length * 2;
    const wavLength = 44 + bufferLength;
    const buffer = new ArrayBuffer(wavLength);
    const view = new DataView(buffer);

    // WAV header
    AudioProcessor.writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + bufferLength, true);
    AudioProcessor.writeString(view, 8, "WAVE");
    AudioProcessor.writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    AudioProcessor.writeString(view, 36, "data");
    view.setUint32(40, bufferLength, true);

    // Audio data
    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, samples[i], true);
    }

    return buffer;
  }

  private static writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  private static arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  }

  static processAudioData(data: readonly number[]): string {
    if (!data.length) throw new Error('No audio data provided');

    const buffer = new Int16Array(data.length * 2);
    data.forEach((val, i) => {
      const sample = Math.floor(Math.max(-1, Math.min(1, val)) * AUDIO_CONFIG.VOLUME_MAX);
      buffer[i * 2] = sample;
      buffer[i * 2 + 1] = sample;
    });

    const wavBuffer = AudioProcessor.createWavBuffer(buffer, AUDIO_CONFIG.SAMPLE_RATE);
    return AudioProcessor.arrayBufferToBase64(wavBuffer);
  }

  static processWaveformData(samples: readonly number[]): readonly number[] {
    if (!samples.length) return new Array(AUDIO_CONFIG.WAVEFORM_POINTS).fill(0);

    return new Array(AUDIO_CONFIG.WAVEFORM_POINTS).fill(0).map((_, i) => {
      const index = Math.floor((i / AUDIO_CONFIG.WAVEFORM_POINTS) * (samples.length / 2)) * 2;
      const iSample = samples[index] || 0;
      const qSample = samples[index + 1] || 0;
      return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
    });
  }
}

class CalculationUtil {
  static frequencyToAltitude(frequency: number): number {
    const freqRange = FREQUENCY_CONFIG.MAX - FREQUENCY_CONFIG.MIN;
    const altitudeRatio = (frequency - FREQUENCY_CONFIG.MIN) / freqRange;
    return ValidationUtil.sanitizeNumber(
      altitudeRatio * CONTROL_CONFIG.ALTITUDE_MAX,
      CONTROL_CONFIG.ALTITUDE_MIN,
      CONTROL_CONFIG.ALTITUDE_MAX,
      1
    );
  }

  static frequencyToAzimuth(frequency: number): number {
    const freqRange = FREQUENCY_CONFIG.MAX - FREQUENCY_CONFIG.MIN;
    const azimuthRatio = (frequency - FREQUENCY_CONFIG.MIN) / freqRange;
    return ValidationUtil.sanitizeNumber(
      azimuthRatio * CONTROL_CONFIG.AZIMUTH_MAX,
      CONTROL_CONFIG.AZIMUTH_MIN,
      CONTROL_CONFIG.AZIMUTH_MAX,
      1
    );
  }

  static altitudeToFrequency(altitude: number): number {
    const freqRange = FREQUENCY_CONFIG.MAX - FREQUENCY_CONFIG.MIN;
    const frequency = FREQUENCY_CONFIG.MIN + (altitude / CONTROL_CONFIG.ALTITUDE_MAX) * freqRange;
    return ValidationUtil.sanitizeNumber(
      frequency,
      FREQUENCY_CONFIG.MIN,
      FREQUENCY_CONFIG.MAX,
      FREQUENCY_CONFIG.PRECISION
    );
  }

  static azimuthToFrequency(azimuth: number): number {
    const freqRange = FREQUENCY_CONFIG.MAX - FREQUENCY_CONFIG.MIN;
    const frequency = FREQUENCY_CONFIG.MIN + (azimuth / CONTROL_CONFIG.AZIMUTH_MAX) * freqRange;
    return ValidationUtil.sanitizeNumber(
      frequency,
      FREQUENCY_CONFIG.MIN,
      FREQUENCY_CONFIG.MAX,
      FREQUENCY_CONFIG.PRECISION
    );
  }

  static getSignalQuality(rssi: number | null): SignalQuality {
    if (rssi === null) return 'Unknown';
    if (rssi > MONITORING_CONFIG.SIGNAL_STRENGTH_THRESHOLD.EXCELLENT) return 'Excellent';
    if (rssi > MONITORING_CONFIG.SIGNAL_STRENGTH_THRESHOLD.GOOD) return 'Good';
    return 'Weak';
  }
}

// === CUSTOM HOOKS ===
const useConnectionStatus = () => {
  const { connectedDevice, checkConnection, getRSSI } = useBLE();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    isConnected: null,
    signalStrength: null,
    deviceName: "",
    battery: 100,
  });

  const isMountedRef = useRef(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkConnectionStatus = useCallback(async () => {
    if (!isMountedRef.current || !connectedDevice) {
      setConnectionStatus(prev => ({
        ...prev,
        isConnected: false,
        signalStrength: null,
      }));
      return;
    }

    try {
      const [isConnected, rssi] = await Promise.all([
        checkConnection(connectedDevice),
        getRSSI(),
      ]);

      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          isConnected,
          signalStrength: rssi,
        }));
      }
    } catch (error) {
      console.error('Connection status check failed:', error);
      if (isMountedRef.current) {
        setConnectionStatus(prev => ({
          ...prev,
          isConnected: false,
          signalStrength: null,
        }));
      }
    }
  }, [connectedDevice, checkConnection, getRSSI]);

  useEffect(() => {
    checkConnectionStatus();
    intervalRef.current = setInterval(checkConnectionStatus, MONITORING_CONFIG.CONNECTION_CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [checkConnectionStatus]);

  useEffect(() => {
    const loadDeviceName = async () => {
      try {
        const name = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_NAME);
        if (name && isMountedRef.current) {
          setConnectionStatus(prev => ({ ...prev, deviceName: name }));
        }
      } catch (error) {
        console.error('Failed to load device name:', error);
      }
    };

    loadDeviceName();
  }, []);

  useEffect(() => {
    const batteryInterval = setInterval(() => {
      if (isMountedRef.current) {
        const batteryLevel = connectedDevice ? Math.floor(Math.random() * 20 + 80) : 100;
        setConnectionStatus(prev => ({ ...prev, battery: batteryLevel }));
      }
    }, MONITORING_CONFIG.BATTERY_UPDATE_INTERVAL);

    return () => clearInterval(batteryInterval);
  }, [connectedDevice]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return connectionStatus;
};

const useControlState = () => {
  const { connectedDevice, writeData, checkConnection } = useBLE();
  const [controlState, setControlState] = useState<ControlState>({
    altitude: 90,
    azimuth: 90,
    frequency: FREQUENCY_CONFIG.MIN,
  });

  const isMountedRef = useRef(true);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSendAngles = useCallback(
    debounce(async (altitude: number, azimuth: number) => {
      if (!isMountedRef.current || !connectedDevice) return;

      try {
        const isConnected = await checkConnection(connectedDevice);
        if (!isConnected) {
          throw new Error('Device not connected');
        }

        const sanitizedAltitude = ValidationUtil.sanitizeNumber(
          altitude,
          CONTROL_CONFIG.ALTITUDE_MIN,
          CONTROL_CONFIG.ALTITUDE_MAX,
          1
        );
        const sanitizedAzimuth = ValidationUtil.sanitizeNumber(
          azimuth,
          CONTROL_CONFIG.AZIMUTH_MIN,
          CONTROL_CONFIG.AZIMUTH_MAX,
          1
        );

        const success = await writeData(sanitizedAltitude, sanitizedAzimuth);
        if (!success) {
          throw new Error('Failed to write data to device');
        }

        if (isMountedRef.current) {
          setControlState(prev => ({
            ...prev,
            altitude: sanitizedAltitude,
            azimuth: sanitizedAzimuth,
          }));
        }
      } catch (error) {
        console.error('Failed to send angles:', error);
        Alert.alert('Connection Error', `Failed to send commands: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, CONTROL_CONFIG.DEBOUNCE_DELAY),
    [connectedDevice, writeData, checkConnection]
  );

  const adjustFrequency = useCallback((delta: number) => {
    setControlState(prev => {
      const newFrequency = ValidationUtil.sanitizeNumber(
        prev.frequency + delta,
        FREQUENCY_CONFIG.MIN,
        FREQUENCY_CONFIG.MAX,
        FREQUENCY_CONFIG.PRECISION
      );

      const newAltitude = CalculationUtil.frequencyToAltitude(newFrequency);
      const newAzimuth = CalculationUtil.frequencyToAzimuth(newFrequency);

      debouncedSendAngles(newAltitude, newAzimuth);

      return {
        ...prev,
        frequency: newFrequency,
      };
    });
  }, [debouncedSendAngles]);

  const adjustAltitude = useCallback(async (delta: number) => {
    if (!connectedDevice) {
      Alert.alert('Error', 'Device not connected');
      return;
    }

    try {
      const isConnected = await checkConnection(connectedDevice);
      if (!isConnected) {
        Alert.alert('Error', 'Device not connected');
        return;
      }

      setControlState(prev => {
        const newAltitude = ValidationUtil.sanitizeNumber(
          prev.altitude + delta,
          CONTROL_CONFIG.ALTITUDE_MIN,
          CONTROL_CONFIG.ALTITUDE_MAX,
          1
        );
        const newFrequency = CalculationUtil.altitudeToFrequency(newAltitude);

        debouncedSendAngles(newAltitude, prev.azimuth);

        return {
          ...prev,
          altitude: newAltitude,
          frequency: newFrequency,
        };
      });
    } catch (error) {
      console.error('Failed to adjust altitude:', error);
      Alert.alert('Error', 'Failed to adjust altitude');
    }
  }, [connectedDevice, checkConnection, debouncedSendAngles]);

  const adjustAzimuth = useCallback(async (delta: number) => {
    if (!connectedDevice) {
      Alert.alert('Error', 'Device not connected');
      return;
    }

    try {
      const isConnected = await checkConnection(connectedDevice);
      if (!isConnected) {
        Alert.alert('Error', 'Device not connected');
        return;
      }

      setControlState(prev => {
        const newAzimuth = ValidationUtil.sanitizeNumber(
          prev.azimuth + delta,
          CONTROL_CONFIG.AZIMUTH_MIN,
          CONTROL_CONFIG.AZIMUTH_MAX,
          1
        );
        const newFrequency = CalculationUtil.azimuthToFrequency(newAzimuth);

        debouncedSendAngles(prev.altitude, newAzimuth);

        return {
          ...prev,
          azimuth: newAzimuth,
          frequency: newFrequency,
        };
      });
    } catch (error) {
      console.error('Failed to adjust azimuth:', error);
      Alert.alert('Error', 'Failed to adjust azimuth');
    }
  }, [connectedDevice, checkConnection, debouncedSendAngles]);

  const startLongPress = useCallback((adjustFn: (delta: number) => void, delta: number) => {
    adjustFn(delta);
    longPressIntervalRef.current = setInterval(() => adjustFn(delta), CONTROL_CONFIG.LONG_PRESS_INTERVAL);
  }, []);

  const stopLongPress = useCallback(() => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  }, []);

  const resetToInitialState = useCallback(async () => {
    const initialState: ControlState = {
      altitude: 90,
      azimuth: 90,
      frequency: FREQUENCY_CONFIG.MIN,
    };

    setControlState(initialState);
    await debouncedSendAngles(initialState.altitude, initialState.azimuth);
  }, [debouncedSendAngles]);

  const setControlFromCoordinates = useCallback((altitude: number, azimuth: number) => {
    if (!ValidationUtil.validateAltitude(altitude) || !ValidationUtil.validateAzimuth(azimuth)) {
      throw new Error('Invalid coordinates provided');
    }

    const newFrequency = CalculationUtil.altitudeToFrequency(altitude);
    setControlState({
      altitude,
      azimuth,
      frequency: newFrequency,
    });
    debouncedSendAngles(altitude, azimuth);
  }, [debouncedSendAngles]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      debouncedSendAngles.cancel();
      if (longPressIntervalRef.current) {
        clearInterval(longPressIntervalRef.current);
      }
    };
  }, [debouncedSendAngles]);

  return {
    controlState,
    adjustFrequency,
    adjustAltitude,
    adjustAzimuth,
    startLongPress,
    stopLongPress,
    resetToInitialState,
    setControlFromCoordinates,
  };
};

const useAudioState = () => {
  const [audioState, setAudioState] = useState<AudioState>({
    isPlaying: false,
    isRecording: false,
    sound: null,
    waveformData: new Array(AUDIO_CONFIG.WAVEFORM_POINTS).fill(0),
  });

  const isMountedRef = useRef(true);
  const recordedAudioRef = useRef<string | null>(null);

  const playRealTimeAudio = useCallback(async (data: readonly number[], record: boolean) => {
    if (!data.length || !isMountedRef.current) return;

    try {
      // Clean up previous sound
      if (audioState.sound) {
        await audioState.sound.unloadAsync();
        setAudioState(prev => ({ ...prev, sound: null }));
      }

      const base64Audio = AudioProcessor.processAudioData(data);
      const uri = `data:audio/wav;base64,${base64Audio}`;

      if (record) {
        recordedAudioRef.current = base64Audio;
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: audioState.isPlaying, isLooping: true }
      );

      if (isMountedRef.current) {
        setAudioState(prev => ({ ...prev, sound: newSound }));
      } else {
        await newSound.unloadAsync();
      }
    } catch (error) {
      console.error('Audio playback error:', error);
    }
  }, [audioState.sound, audioState.isPlaying]);

  const handleDataReceived = useCallback((samples: readonly number[]) => {
    if (!isMountedRef.current) return;

    try {
      const newWaveformData = AudioProcessor.processWaveformData(samples);
      setAudioState(prev => ({ ...prev, waveformData: newWaveformData }));

      if (audioState.isPlaying) {
        playRealTimeAudio(newWaveformData, audioState.isRecording);
      }
    } catch (error) {
      console.error('Failed to process audio data:', error);
    }
  }, [audioState.isPlaying, audioState.isRecording, playRealTimeAudio]);

  const handlePlayPause = useCallback(async () => {
    if (!audioState.sound) return;

    try {
      if (audioState.isPlaying) {
        await audioState.sound.pauseAsync();
        setAudioState(prev => ({
          ...prev,
          isPlaying: false,
          isRecording: false,
        }));
      } else {
        await audioState.sound.playAsync();
        setAudioState(prev => ({
          ...prev,
          isPlaying: true,
          isRecording: true,
        }));
      }
    } catch (error) {
      console.error('Play/Pause error:', error);
      Alert.alert('Error', 'Failed to play/pause audio');
    }
  }, [audioState.sound, audioState.isPlaying]);

  const handleStop = useCallback(async () => {
    if (!audioState.sound || !audioState.isPlaying) return;

    try {
      await audioState.sound.stopAsync();
      await audioState.sound.unloadAsync();
      setAudioState(prev => ({
        ...prev,
        sound: null,
        isPlaying: false,
        isRecording: false,
      }));
      Alert.alert('Playback Stopped');
    } catch (error) {
      console.error('Stop error:', error);
      Alert.alert('Error', 'Failed to stop audio');
    }
  }, [audioState.sound, audioState.isPlaying]);

  const resetAudioState = useCallback(async () => {
    if (audioState.sound) {
      try {
        await audioState.sound.stopAsync();
        await audioState.sound.unloadAsync();
      } catch (error) {
        console.error('Failed to cleanup audio on reset:', error);
      }
    }
    
    setAudioState({
      isPlaying: false,
      isRecording: false,
      sound: null,
      waveformData: new Array(AUDIO_CONFIG.WAVEFORM_POINTS).fill(0),
    });
    recordedAudioRef.current = null;
  }, [audioState.sound]);

  const getRecordedAudio = useCallback(() => recordedAudioRef.current, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (audioState.sound) {
        audioState.sound.unloadAsync().catch(console.error);
      }
    };
  }, [audioState.sound]);

  return {
    audioState,
    handleDataReceived,
    handlePlayPause,
    handleStop,
    resetAudioState,
    getRecordedAudio,
  };
};

const useModalState = () => {
  const [modalState, setModalState] = useState<ModalState>({
    isSaveModalVisible: false,
    isFindModalVisible: false,
    signalName: "",
    findAltitude: "",
    findAzimuth: "",
  });

  const showSaveModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isSaveModalVisible: true }));
  }, []);

  const hideSaveModal = useCallback(() => {
    setModalState(prev => ({
      ...prev,
      isSaveModalVisible: false,
      signalName: "",
    }));
  }, []);

  const showFindModal = useCallback(() => {
    setModalState(prev => ({ ...prev, isFindModalVisible: true }));
  }, []);

  const hideFindModal = useCallback(() => {
    setModalState(prev => ({
      ...prev,
      isFindModalVisible: false,
      findAltitude: "",
      findAzimuth: "",
    }));
  }, []);

  const setSignalName = useCallback((name: string) => {
    setModalState(prev => ({ ...prev, signalName: name }));
  }, []);

  const setFindAltitude = useCallback((altitude: string) => {
    setModalState(prev => ({ ...prev, findAltitude: altitude }));
  }, []);

  const setFindAzimuth = useCallback((azimuth: string) => {
    setModalState(prev => ({ ...prev, findAzimuth: azimuth }));
  }, []);

  return {
    modalState,
    showSaveModal,
    hideSaveModal,
    showFindModal,
    hideFindModal,
    setSignalName,
    setFindAltitude,
    setFindAzimuth,
  };
};

const useSavedSignals = () => {
  const [savedSignals, setSavedSignals] = useState<readonly SavedSignal[]>([]);

  const loadSavedSignals = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEYS.SAVED_SIGNALS);
      if (saved) {
        const signals = JSON.parse(saved) as SavedSignal[];
        setSavedSignals(signals);
      }
    } catch (error) {
      console.error('Failed to load saved signals:', error);
    }
  }, []);

  const saveSignal = useCallback(async (signal: Omit<SavedSignal, 'id' | 'timestamp'>): Promise<boolean> => {
    try {
      if (!ValidationUtil.validateSignalName(signal.name)) {
        Alert.alert('Error', 'Please enter a valid signal name (1-50 characters)');
        return false;
      }

      const newSignal: SavedSignal = {
        ...signal,
        id: ValidationUtil.generateId(),
        timestamp: Date.now(),
      };

      const updatedSignals = [...savedSignals, newSignal];
      setSavedSignals(updatedSignals);
      await AsyncStorage.setItem(STORAGE_KEYS.SAVED_SIGNALS, JSON.stringify(updatedSignals));
      Alert.alert('Success', 'Signal saved successfully!');
      return true;
    } catch (error) {
      console.error('Failed to save signal:', error);
      Alert.alert('Error', 'Failed to save signal');
      return false;
    }
  }, [savedSignals]);

  useEffect(() => {
    loadSavedSignals();
  }, [loadSavedSignals]);

  return {
    savedSignals,
    saveSignal,
    loadSavedSignals,
  };
};

// === COMPONENTS ===
const Waveform: React.FC<WaveformProps> = React.memo(({ data, cursorPosition, onCursorMove }) => {
  const cursorPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (evt, gestureState) => {
      const newX = Math.max(10, Math.min(SCREEN_CONFIG.WIDTH - 10, cursorPosition.x + gestureState.dx));
      onCursorMove({ x: newX, y: cursorPosition.y });
    },
    onPanResponderRelease: () => {},
  }), [cursorPosition.x, cursorPosition.y, onCursorMove]);

  return (
    <View style={styles.waveformContainer} {...cursorPanResponder.panHandlers}>
      {Array.from(data).map((amp, i) => (
        <View
          key={i}
          style={[styles.waveBar, { height: Math.max(2, 2 + amp * 96) }]}
        />
      ))}
      <View
        style={[
          styles.cursor,
          { left: cursorPosition.x - 1.5, top: cursorPosition.y - 75 },
        ]}
      />
    </View>
  );
});

// Add display name
Waveform.displayName = 'Waveform';

// === MAIN COMPONENT ===
const FreeUseMode: React.FC = () => {
  const { connectedDevice } = useBLE();
  const connectionStatus = useConnectionStatus();
  const { controlState, adjustFrequency, adjustAltitude, adjustAzimuth, startLongPress, stopLongPress, resetToInitialState, setControlFromCoordinates } = useControlState();
  const { audioState, handleDataReceived, handlePlayPause, handleStop, resetAudioState, getRecordedAudio } = useAudioState();
  const { modalState, showSaveModal, hideSaveModal, showFindModal, hideFindModal, setSignalName, setFindAltitude, setFindAzimuth } = useModalState();
  const { saveSignal } = useSavedSignals();

  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    x: SCREEN_CONFIG.WIDTH / 2,
    y: 75,
  });

  const waveformScrollRef = useRef<number>(0);
  const isMountedRef = useRef(true);

  // === GESTURE HANDLERS ===
  const frequencyPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (evt, gestureState) => {
      const sensitivity = 0.1;
      const deltaFreq = -gestureState.dx * sensitivity;
      adjustFrequency(deltaFreq);
      waveformScrollRef.current += gestureState.dx;
    },
    onPanResponderRelease: () => {
      waveformScrollRef.current = 0;
    },
  }), [adjustFrequency]);

  // === EVENT HANDLERS ===
  const handleSaveSignal = useCallback(async () => {
    if (!ValidationUtil.validateSignalName(modalState.signalName)) {
      Alert.alert('Error', 'Please enter a valid signal name');
      return;
    }

    const success = await saveSignal({
      name: modalState.signalName,
      frequency: controlState.frequency,
      altitude: controlState.altitude,
      azimuth: controlState.azimuth,
      audioBase64: getRecordedAudio() || undefined,
    });

    if (success) {
      hideSaveModal();
    }
  }, [modalState.signalName, controlState, saveSignal, getRecordedAudio, hideSaveModal]);

  const handleFindSignal = useCallback(() => {
    const altitude = parseFloat(modalState.findAltitude);
    const azimuth = parseFloat(modalState.findAzimuth);

    if (!ValidationUtil.validateAltitude(altitude) || !ValidationUtil.validateAzimuth(azimuth)) {
      Alert.alert('Error', 'Please enter valid coordinates (Altitude: 0-180°, Azimuth: 0-360°)');
      return;
    }

    try {
      setControlFromCoordinates(altitude, azimuth);
      hideFindModal();
    } catch (_error) {
      Alert.alert('Error', 'Failed to set coordinates');
    }
  }, [modalState.findAltitude, modalState.findAzimuth, setControlFromCoordinates, hideFindModal]);

  const handleReset = useCallback(async () => {
    if (!isMountedRef.current) return;

    try {
      await Promise.all([
        resetToInitialState(),
        resetAudioState(),
      ]);
      Alert.alert('Reset', 'System reset to initial state');
    } catch (error) {
      console.error('Reset failed:', error);
      Alert.alert('Error', 'Failed to reset system');
    }
  }, [resetToInitialState, resetAudioState]);

  // === LIFECYCLE ===
  useEffect(() => {
    isMountedRef.current = true;

    if (!connectedDevice) {
      Alert.alert('No Device Connected', 'Please connect to a device.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
      return;
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [connectedDevice]);

  // === RENDER HELPERS ===
  const getSignalQuality = useMemo(() => 
    CalculationUtil.getSignalQuality(connectionStatus.signalStrength),
    [connectionStatus.signalStrength]
  );

  const getStatusColor = useCallback((isConnected: boolean | null) => {
    if (isConnected === null) return UI_CONFIG.WARNING_COLOR;
    return isConnected ? UI_CONFIG.SUCCESS_COLOR : UI_CONFIG.ERROR_COLOR;
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Go back"
          >
            <View style={styles.backCircle}>
              <AntDesign name="arrowleft" size={20} color="white" />
            </View>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.subtitle} numberOfLines={1}>
              {connectionStatus.deviceName || "Radio Telescope"}
            </Text>
          </View>
        </View>

        {/* Status Bar */}
        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <View style={styles.statusIconBG}>
              <View style={styles.statusIconInner} />
            </View>
            <Text style={styles.statusLabel}>STATUS</Text>
            <Text style={[styles.statusValue, { color: getStatusColor(connectionStatus.isConnected) }]}>
              {connectionStatus.isConnected === null
                ? "Checking..."
                : connectionStatus.isConnected
                ? "Connected"
                : "Disconnected"}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <FontAwesome5 name="wifi" size={20} color="white" />
            <Text style={styles.statusLabel}>SIGNAL</Text>
            <Text style={[styles.statusValue, { color: UI_CONFIG.SUCCESS_COLOR }]}>
              {getSignalQuality}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <MaterialIcons name="battery-full" size={24} color={UI_CONFIG.SUCCESS_COLOR} />
            <Text style={styles.statusLabel}>BATTERY</Text>
            <Text style={styles.statusValue}>{connectionStatus.battery}%</Text>
          </View>
        </View>

        {/* Coordinates */}
        <View style={styles.coordsContainer}>
          <Text style={styles.coordsText}>
            ALTITUDE: {controlState.altitude.toFixed(1)}°
          </Text>
          <Text style={styles.coordsText}>
            AZIMUTH: {controlState.azimuth.toFixed(1)}°
          </Text>
        </View>

        {/* Waveform Area */}
        <View style={styles.waveformArea} {...frequencyPanResponder.panHandlers}>
          <Text style={styles.frequencyText}>
            FREQUENCY: {controlState.frequency.toFixed(FREQUENCY_CONFIG.PRECISION)} MHz
          </Text>
          <View style={{ width: SCREEN_CONFIG.WIDTH }}>
            <Waveform 
              data={audioState.waveformData} 
              cursorPosition={cursorPosition}
              onCursorMove={setCursorPosition}
            />
          </View>
          <View style={styles.playhead} />
          <Text style={styles.swipeHint}>
            ← Swipe left/right to adjust frequency →
          </Text>
        </View>

        {/* RTL-SDR Component */}
        <RTLSDRComponent 
          frequency={controlState.frequency} 
          onDataReceived={handleDataReceived} 
        />

        {/* Frequency Controls */}
        <View style={styles.freqControls}>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(-FREQUENCY_CONFIG.COARSE_STEP)}
            onLongPress={() => startLongPress((delta) => adjustFrequency(delta), -FREQUENCY_CONFIG.COARSE_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Decrease frequency by 1 MHz"
          >
            <Text style={styles.freqButtonText}>--</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(-FREQUENCY_CONFIG.FINE_STEP)}
            onLongPress={() => startLongPress((delta) => adjustFrequency(delta), -FREQUENCY_CONFIG.FINE_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Decrease frequency by 0.01 MHz"
          >
            <Text style={styles.freqButtonText}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(FREQUENCY_CONFIG.FINE_STEP)}
            onLongPress={() => startLongPress((delta) => adjustFrequency(delta), FREQUENCY_CONFIG.FINE_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Increase frequency by 0.01 MHz"
          >
            <Text style={styles.freqButtonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(FREQUENCY_CONFIG.COARSE_STEP)}
            onLongPress={() => startLongPress((delta) => adjustFrequency(delta), FREQUENCY_CONFIG.COARSE_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Increase frequency by 1 MHz"
          >
            <Text style={styles.freqButtonText}>++</Text>
          </TouchableOpacity>
        </View>

        {/* D-Pad Controls */}
        <View style={styles.dpadContainer}>
          <View style={[styles.dpadArm, styles.dpadHorizontalOutline]} />
          <View style={[styles.dpadArm, styles.dpadVerticalOutline]} />
          <View style={[styles.dpadArm, styles.dpadHorizontal]} />
          <View style={[styles.dpadArm, styles.dpadVertical]} />
          
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonUp]}
            onPress={() => adjustAltitude(CONTROL_CONFIG.ALTITUDE_STEP)}
            onLongPress={() => startLongPress((delta) => adjustAltitude(delta), CONTROL_CONFIG.ALTITUDE_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Increase altitude"
          >
            <FontAwesome5 name="chevron-up" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonDown]}
            onPress={() => adjustAltitude(-CONTROL_CONFIG.ALTITUDE_STEP)}
            onLongPress={() => startLongPress((delta) => adjustAltitude(delta), -CONTROL_CONFIG.ALTITUDE_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Decrease altitude"
          >
            <FontAwesome5 name="chevron-down" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonLeft]}
            onPress={() => adjustAzimuth(-CONTROL_CONFIG.AZIMUTH_STEP)}
            onLongPress={() => startLongPress((delta) => adjustAzimuth(delta), -CONTROL_CONFIG.AZIMUTH_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Decrease azimuth"
          >
            <FontAwesome5 name="undo" size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonRight]}
            onPress={() => adjustAzimuth(CONTROL_CONFIG.AZIMUTH_STEP)}
            onLongPress={() => startLongPress((delta) => adjustAzimuth(delta), CONTROL_CONFIG.AZIMUTH_STEP)}
            onPressOut={stopLongPress}
            accessibilityLabel="Increase azimuth"
          >
            <FontAwesome5 name="redo" size={20} color="white" />
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.centerButton} accessibilityLabel="Center button">
            <View style={styles.centerButtonGlow}>
              <View style={styles.centerButtonCore} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.bottomButtonCircle}
            onPress={showSaveModal}
            accessibilityLabel="Save signal"
          >
            <Text style={styles.bottomButtonText}>SAVE SIGNAL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButtonCirclePurple}
            onPress={showFindModal}
            accessibilityLabel="Find signal"
          >
            <Text style={styles.bottomButtonText}>FIND SIGNAL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButtonCircleRed}
            onPress={handleReset}
            accessibilityLabel="Reset system"
          >
            <Text style={styles.bottomButtonText}>RESET</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={handleStop}
            accessibilityLabel="Stop audio"
          >
            <MaterialIcons name="stop-circle" size={50} color="#FF6B6B" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.recPauseButton}
            onPress={handlePlayPause}
            accessibilityLabel={audioState.isPlaying ? "Pause audio" : "Play audio"}
          >
            <Ionicons
              name={audioState.isPlaying ? "pause" : "play"}
              size={24}
              color="white"
            />
          </TouchableOpacity>
        </View>

        {/* Save Signal Modal */}
        <Modal visible={modalState.isSaveModalVisible} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Save Signal</Text>
              <TextInput
                style={styles.input}
                placeholder="Signal Name (max 50 characters)"
                placeholderTextColor="#666"
                value={modalState.signalName}
                onChangeText={setSignalName}
                maxLength={50}
                returnKeyType="done"
              />
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={hideSaveModal}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleSaveSignal}
                >
                  <Text style={styles.modalButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Find Signal Modal */}
        <Modal visible={modalState.isFindModalVisible} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Find Signal</Text>
              <TextInput
                style={styles.input}
                placeholder="Altitude (0-180°)"
                placeholderTextColor="#666"
                value={modalState.findAltitude}
                onChangeText={setFindAltitude}
                keyboardType="numeric"
                returnKeyType="next"
              />
              <TextInput
                style={styles.input}
                placeholder="Azimuth (0-360°)"
                placeholderTextColor="#666"
                value={modalState.findAzimuth}
                onChangeText={setFindAzimuth}
                keyboardType="numeric"
                returnKeyType="done"
              />
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={hideFindModal}
                >
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={handleFindSignal}
                >
                  <Text style={styles.modalButtonText}>Find</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#121212", 
    alignItems: "center" 
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 15,
    paddingTop: 30,
  },
  backButton: { 
    margin: 2 
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  titleContainer: { 
    flex: 1, 
    alignItems: "center", 
    marginRight: 40 
  },
  subtitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "300",
    fontFamily: "Shantell",
  },
  statusBar: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    marginTop: 20,
    paddingHorizontal: 10,
  },
  statusItem: { 
    alignItems: "center" 
  },
  statusLabel: { 
    color: "white", 
    fontSize: 12, 
    marginTop: 4 
  },
  statusValue: { 
    color: "white", 
    fontSize: 14, 
    fontWeight: "bold" 
  },
  statusIconBG: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255, 154, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  statusIconInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
  },
  coordsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "90%",
    marginTop: 15,
  },
  coordsText: { 
    color: UI_CONFIG.ACCENT_COLOR, 
    fontSize: 14, 
    fontFamily: "Shantell" 
  },
  waveformArea: {
    height: 220,
    marginTop: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  waveformContainer: {
    width: SCREEN_CONFIG.WIDTH,
    height: 150,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    paddingBottom: 10,
    position: "relative",
  },
  waveBar: { 
    backgroundColor: "white", 
    width: 2,
    minHeight: 2,
  },
  playhead: {
    position: "absolute",
    left: "50%",
    height: "70%",
    width: 3,
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
    marginLeft: -1.5,
    borderRadius: 2,
    top: 30,
  },
  cursor: {
    position: "absolute",
    height: 100,
    width: 3,
    backgroundColor: UI_CONFIG.SUCCESS_COLOR,
    borderRadius: 2,
    zIndex: 10,
  },
  frequencyText: {
    color: UI_CONFIG.ACCENT_COLOR,
    fontSize: 16,
    marginBottom: 10,
    fontFamily: "Shantell",
  },
  swipeHint: { 
    color: "#666", 
    fontSize: 12, 
    marginTop: 5, 
    fontStyle: "italic" 
  },
  freqControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "80%",
    marginVertical: 15,
  },
  freqButton: {
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
    width: 50,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  freqButtonText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "white",
    lineHeight: 24,
  },
  bottomBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 15,
    marginTop: 15,
  },
  bottomButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
    justifyContent: "center",
    alignItems: "center",
    padding: 5,
    margin: 5,
  },
  bottomButtonCirclePurple: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#9b59b6",
    justifyContent: "center",
    alignItems: "center",
    padding: 5,
    margin: 5,
  },
  bottomButtonCircleRed: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: UI_CONFIG.ERROR_COLOR,
    justifyContent: "center",
    alignItems: "center",
    padding: 5,
    margin: 5,
  },
  bottomButtonText: {
    color: "white",
    fontFamily: "Shantell",
    fontSize: 8,
    textAlign: "center",
  },
  recPauseButton: {
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
    width: 80,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    margin: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: 320,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.8)",
    borderWidth: 2,
    borderColor: UI_CONFIG.ACCENT_COLOR,
    borderStyle: "dashed",
    borderRadius: 50,
  },
  modalTitle: {
    color: "white",
    fontSize: 18,
    marginBottom: 15,
  },
  input: {
    width: "100%",
    height: 60,
    backgroundColor: "#2C2C2E",
    borderRadius: 25,
    color: "white",
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  modalButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    gap: 10,
  },
  modalButton: {
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    flex: 1,
    alignItems: "center",
  },
  modalButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  dpadContainer: {
    width: UI_CONFIG.DPAD_SIZE,
    height: UI_CONFIG.DPAD_SIZE,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 20,
  },
  dpadArm: {
    position: "absolute",
    borderRadius: 15,
  },
  dpadHorizontal: {
    width: "100%",
    height: UI_CONFIG.ARM_THICKNESS,
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
  },
  dpadVertical: {
    width: UI_CONFIG.ARM_THICKNESS,
    height: "100%",
    backgroundColor: UI_CONFIG.ACCENT_COLOR,
  },
  dpadHorizontalOutline: {
    width: "103%",
    height: UI_CONFIG.ARM_THICKNESS + 6,
    backgroundColor: UI_CONFIG.OUTLINE_COLOR,
  },
  dpadVerticalOutline: {
    width: UI_CONFIG.ARM_THICKNESS + 6,
    height: "103%",
    backgroundColor: UI_CONFIG.OUTLINE_COLOR,
  },
  dpadButton: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    width: UI_CONFIG.ARM_THICKNESS,
    height: UI_CONFIG.ARM_THICKNESS,
  },
  dpadButtonUp: {
    top: 0,
    alignSelf: "center",
  },
  dpadButtonDown: {
    bottom: 0,
    alignSelf: "center",
  },
  dpadButtonLeft: {
    left: 0,
    top: 0,
    height: "100%",
  },
  dpadButtonRight: {
    right: 0,
    top: 0,
    height: "100%",
  },
  centerButton: {
    position: "absolute",
    width: UI_CONFIG.DPAD_SIZE * 0.4,
    height: UI_CONFIG.DPAD_SIZE * 0.4,
    justifyContent: "center",
    alignItems: "center",
  },
  centerButtonGlow: {
    width: "100%",
    height: "100%",
    borderRadius: (UI_CONFIG.DPAD_SIZE * 0.4) / 2,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: UI_CONFIG.ACCENT_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 15,
  },
  centerButtonCore: {
    width: "70%",
    height: "70%",
    borderRadius: (UI_CONFIG.DPAD_SIZE * 0.4 * 0.7) / 2,
    backgroundColor: "black",
    borderWidth: 4,
    borderColor: UI_CONFIG.ACCENT_COLOR,
  },
});

export default FreeUseMode;