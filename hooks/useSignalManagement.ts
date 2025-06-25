import { useState, useRef, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { debounce } from 'lodash';
import { useBLE } from '../context/BLEContext';
import { MIN_FREQUENCY, MAX_FREQUENCY } from '../utils/constants';

interface SavedSignal {
  name: string;
  frequency: number;
  altitude: number;
  azimuth: number;
  audioBase64?: string;
}

export const useSignalManagement = (
  connectedDevice: any,
  initialFrequency: number,
  recordedAudioRef: React.MutableRefObject<string | null>,
  tuneSDR: (freq: number) => Promise<void>,
  adjustFrequency: (delta: number) => Promise<void>
) => {
  const { writeData } = useBLE();
  const [frequency, setFrequency] = useState<number>(initialFrequency);
  const [altitude, setAltitude] = useState<number>(90);
  const [azimuth, setAzimuth] = useState<number>(90);
  const [savedSignals, setSavedSignals] = useState<SavedSignal[]>([]);
  const [signalName, setSignalName] = useState<string>('');
  const [isSaveModalVisible, setIsSaveModalVisible] = useState<boolean>(false);
  const [isFindModalVisible, setIsFindModalVisible] = useState<boolean>(false);
  const [findAltitude, setFindAltitude] = useState<string>('');
  const [findAzimuth, setFindAzimuth] = useState<string>('');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  const debouncedSendAngles = debounce(async (alt: number, az: number) => {
    if (!connectedDevice || !writeData) {
      Alert.alert('Error', 'No device connected');
      return;
    }

    const constrainedAltitude = Math.max(0, Math.min(180, Math.round(alt)));
    const constrainedAzimuth = Math.max(0, Math.min(360, Math.round(az)));

    try {
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        await writeData(constrainedAltitude, constrainedAzimuth);
        setAltitude(constrainedAltitude);
        setAzimuth(constrainedAzimuth);
      });
      await writeQueueRef.current;
    } catch (error) {
      console.error('BLE Write Error:', error);
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        ? (error as { message: string }).message
        : String(error);
      Alert.alert('Error', `Failed to send angles: ${errorMessage}`);
    }
  }, 200);

  const startLongPress = (adjustFn: (delta: number) => void, delta: number) => {
    adjustFn(delta);
    longPressIntervalRef.current = setInterval(() => adjustFn(delta), 100);
  };

  const stopLongPress = () => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  };

  const handleSaveSignal = async () => {
    if (!signalName) {
      Alert.alert('Error', 'Please enter a signal name.');
      return;
    }

    const newSignal: SavedSignal = {
      name: signalName,
      frequency,
      altitude,
      azimuth,
      audioBase64: recordedAudioRef.current || undefined,
    };

    const updatedSignals = [...savedSignals, newSignal];
    setSavedSignals(updatedSignals);
    try {
      await AsyncStorage.setItem('savedSignals', JSON.stringify(updatedSignals));
      Alert.alert('Success', 'Signal saved successfully!');
    } catch (error) {
      console.error('Error saving signal:', error);
      Alert.alert('Error', 'Failed to save signal.');
    }

    setSignalName('');
    setIsSaveModalVisible(false);
  };

  const handleFindSignal = () => {
    const alt = parseFloat(findAltitude);
    const az = parseFloat(findAzimuth);

    if (isNaN(alt) || isNaN(az)) {
      Alert.alert('Error', 'Please enter valid altitude and azimuth values.');
      return;
    }

    if (alt < 0 || alt > 180 || az < 0 || az > 360) {
      Alert.alert('Error', 'Altitude must be 0-180° and Azimuth must be 0-360°.');
      return;
    }

    debouncedSendAngles(alt, az);
    const freqRange = MAX_FREQUENCY - MIN_FREQUENCY;
    const newFrequency = MIN_FREQUENCY + (alt / 180) * freqRange;
    setFrequency(parseFloat(newFrequency.toFixed(3)));
    tuneSDR(newFrequency);
    setIsFindModalVisible(false);
    setFindAltitude('');
    setFindAzimuth('');
  };

  const handleReset = async () => {
    setFrequency(MIN_FREQUENCY);
    setAltitude(90);
    setAzimuth(90);
    setIsPlaying(false);
    setIsRecording(false);
    recordedAudioRef.current = null;
    await tuneSDR(MIN_FREQUENCY);
    await debouncedSendAngles(90, 90);
    Alert.alert('Reset', 'System reset to initial state.');
  };

  useEffect(() => {
    const loadSavedSignals = async () => {
      try {
        const saved = await AsyncStorage.getItem('savedSignals');
        if (saved) {
          setSavedSignals(JSON.parse(saved));
        }
      } catch (error) {
        console.error('Error loading saved signals:', error);
      }
    };

    loadSavedSignals();
  }, []);

  return {
    altitude,
    azimuth,
    savedSignals,
    signalName,
    isSaveModalVisible,
    isFindModalVisible,
    findAltitude,
    findAzimuth,
    setAltitude,
    setAzimuth,
    setSignalName,
    setIsSaveModalVisible,
    setIsFindModalVisible,
    setFindAltitude,
    setFindAzimuth,
    handleSaveSignal,
    handleFindSignal,
    handleReset,
    startLongPress,
    stopLongPress,
  };
};
