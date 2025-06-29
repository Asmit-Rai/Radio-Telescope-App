import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { useBLE } from "context/BLEContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { debounce } from "lodash";
import RTLSDRComponent from "components/RTLSDRComponent";

const SCREEN_WIDTH = Dimensions.get("window").width;

const MIN_FREQUENCY = 10.0;
const MAX_FREQUENCY = 2000.0;
const FINE_FREQUENCY_STEP = 0.01;
const COARSE_FREQUENCY_STEP = 1.0;
const SAMPLE_RATE = 44100;
const ALTITUDE_STEP = 1.0;
const AZIMUTH_STEP = 1.0;
const DPAD_SIZE = 180;
const ARM_THICKNESS = DPAD_SIZE * 0.4;
const ACCENT_COLOR_ORANGE = "#FF833A";
const OUTLINE_COLOR_BLUE = "#121212";

interface WaveformProps {
  data: number[];
}

interface SavedSignal {
  name: string;
  frequency: number;
  altitude: number;
  azimuth: number;
  audioBase64?: string;
}

interface CursorPosition {
  x: number;
  y: number;
}

const FreeUseMode: React.FC = () => {
  const { connectedDevice, writeData, checkConnection, getRSSI } = useBLE();
  const [status, setStatus] = useState<string>("Disconnected");
  const [signal, setSignal] = useState<string>("Unknown");
  const [battery, setBattery] = useState<number>(100);
  const [altitude, setAltitude] = useState<number>(90);
  const [azimuth, setAzimuth] = useState<number>(90);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [frequency, setFrequency] = useState<number>(MIN_FREQUENCY);
  const [deviceName, setDeviceName] = useState<string>("");
  const [waveformData, setWaveformData] = useState<number[]>(new Array(100).fill(0));
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    x: SCREEN_WIDTH / 2,
    y: 75,
  });
  const [savedSignals, setSavedSignals] = useState<SavedSignal[]>([]);
  const [signalName, setSignalName] = useState<string>("");
  const [isSaveModalVisible, setIsSaveModalVisible] = useState<boolean>(false);
  const [isFindModalVisible, setIsFindModalVisible] = useState<boolean>(false);
  const [findAltitude, setFindAltitude] = useState<string>("");
  const [findAzimuth, setFindAzimuth] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [signalStrength, setSignalStrength] = useState<number | null>(null);

  const recordedAudioRef = useRef<string | null>(null);
  const waveformScrollRef = useRef<number>(0);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  const debouncedSendAngles = useCallback(
    debounce(async (alt: number, az: number) => {
      if (!isMountedRef.current) return;

      if (!connectedDevice || !writeData || !(await checkConnection(connectedDevice))) {
        Alert.alert("Error", "No device connected or connection lost");
        setIsConnected(false);
        return;
      }

      const constrainedAltitude = Math.max(0, Math.min(180, Math.round(alt * 10) / 10));
      const constrainedAzimuth = Math.max(0, Math.min(360, Math.round(az * 10) / 10));

      try {
        const success = await writeData(constrainedAltitude, constrainedAzimuth);
        if (!success) throw new Error("Write failed");
        if (isMountedRef.current) {
          setAltitude(constrainedAltitude);
          setAzimuth(constrainedAzimuth);
          console.log(`Sent angles: alt=${constrainedAltitude}, az=${constrainedAzimuth}`);
        }
      } catch (error) {
        console.error("BLE Write Error:", error);
        Alert.alert("Error", `Failed to send angles: ${(error as Error).message || "Unknown error"}`);
        if (isMountedRef.current) setIsConnected(false);
      }
    }, 1000),
    [connectedDevice, writeData, checkConnection]
  );

  const startLongPress = useCallback((adjustFn: (delta: number) => void, delta: number) => {
    adjustFn(delta);
    longPressIntervalRef.current = setInterval(() => adjustFn(delta), 150);
  }, []);

  const stopLongPress = useCallback(() => {
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkStatusAndSignal = async () => {
      if (!isMountedRef.current) return;

      if (!connectedDevice) {
        setIsConnected(false);
        setSignalStrength(null);
        setStatus("Disconnected");
        setSignal("Unknown");
        return;
      }

      try {
        const connection = await checkConnection(connectedDevice);
        if (isMountedRef.current) {
          setIsConnected(connection);
          if (connection) {
            const rssi = await getRSSI();
            setSignalStrength(rssi);
            setStatus(rssi ? (rssi > -70 ? "Excellent" : rssi > -85 ? "Good" : "Weak") : "Unknown");
            setSignal(rssi ? (rssi > -70 ? "Excellent" : rssi > -85 ? "Good" : "Weak") : "Unknown");
            console.log(`Connection check: connected=${connection}, rssi=${rssi}`);
          } else {
            setSignalStrength(null);
            setStatus("Disconnected");
            setSignal("Unknown");
          }
        }
      } catch (error) {
        console.error("Connection check error:", error);
        if (isMountedRef.current) {
          setIsConnected(false);
          setSignalStrength(null);
          setStatus("Disconnected");
          setSignal("Unknown");
        }
      }
    };

    checkStatusAndSignal();
    interval = setInterval(checkStatusAndSignal, 30000);

    return () => {
      clearInterval(interval);
      console.log("Connection check interval cleared");
    };
  }, [connectedDevice, checkConnection, getRSSI]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isMountedRef.current) {
        const batteryLevel = connectedDevice ? Math.floor(Math.random() * 20 + 80) : 100;
        setBattery(batteryLevel);
        console.log(`Battery level: ${batteryLevel}%`);
      }
    }, 5000);

    return () => {
      clearInterval(interval);
      console.log("Battery interval cleared");
    };
  }, [connectedDevice]);

  const frequencyPanResponder = PanResponder.create({
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
  });

  const cursorPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (evt, gestureState) => {
      setCursorPosition((prev) => ({
        x: Math.max(10, Math.min(SCREEN_WIDTH - 10, prev.x + gestureState.dx)),
        y: prev.y,
      }));
    },
    onPanResponderRelease: () => {},
  });

  useEffect(() => {
    isMountedRef.current = true;

    if (!connectedDevice) {
      Alert.alert("No Device Connected", "Please connect to a device.", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
      setStatus("Disconnected");
      setSignal("Unknown");
      return;
    }

    const initialize = async () => {
      try {
        const name = await AsyncStorage.getItem("connected_device_name");
        if (name && isMountedRef.current) {
          setDeviceName(name);
          console.log(`Device name: ${name}`);
        }

        const saved = await AsyncStorage.getItem("savedSignals");
        if (saved && isMountedRef.current) {
          setSavedSignals(JSON.parse(saved) as SavedSignal[]);
          console.log("Loaded saved signals");
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      isMountedRef.current = false;
      if (sound) {
        sound.unloadAsync().catch((error) => console.error("Sound unload error:", error));
        setSound(null);
      }
      debouncedSendAngles.cancel();
      stopLongPress();
      console.log("FreeUseMode unmounted, cleaned up resources");
    };
  }, [connectedDevice, debouncedSendAngles, stopLongPress]);

  const handleDataReceived = useCallback((samples: number[]) => {
    const newData = new Array(100).fill(0).map((_, i) => {
      const index = Math.floor((i / 100) * (samples.length / 2)) * 2;
      const iSample = samples[index] || 0;
      const qSample = samples[index + 1] || 0;
      return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
    });
    setWaveformData(newData);
    if (isPlaying && isRecording) {
      playRealTimeAudio(newData, true);
    } else if (isPlaying) {
      playRealTimeAudio(newData, false);
    }
  }, [isPlaying, isRecording]);

  const playRealTimeAudio = useCallback(
    async (data: number[], record: boolean) => {
      if (!data.length || !isMountedRef.current) return;

      try {
        if (sound) {
          await sound.unloadAsync();
          setSound(null);
        }

        const buffer = new Int16Array(data.length * 2);
        data.forEach((val, i) => {
          const sample = Math.floor(val * 32767);
          buffer[i * 2] = sample;
          buffer[i * 2 + 1] = sample;
        });

        const wavBuffer = createWavBuffer(buffer, SAMPLE_RATE);
        const base64 = arrayBufferToBase64(wavBuffer);
        const uri = `data:audio/wav;base64,${base64}`;

        if (record) recordedAudioRef.current = base64;

        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: isPlaying, isLooping: true }
        );

        if (isMountedRef.current) {
          setSound(newSound);
          console.log("Audio playing, record:", record);
        } else {
          await newSound.unloadAsync();
        }
      } catch (error) {
        console.error("Audio Error:", error);
      }
    },
    [isPlaying]
  );

  const handlePlayPause = async () => {
    if (!sound) return;

    try {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
        setIsRecording(false);
        console.log("Audio paused");
      } else {
        await sound.playAsync();
        setIsPlaying(true);
        setIsRecording(true);
        console.log("Audio playing");
      }
    } catch (error) {
      console.error("Play/Pause Error:", error);
      Alert.alert("Error", "Failed to play/pause audio");
    }
  };

  const handleStop = async () => {
    if (sound && isPlaying) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
        setIsRecording(false);
        Alert.alert("Playback Stopped");
        console.log("Audio stopped");
      } catch (error) {
        console.error("Stop Error:", error);
        Alert.alert("Error", "Failed to stop audio");
      }
    }
  };

  const adjustFrequency = useCallback(
    (delta: number) => {
      setFrequency((prev) => {
        const newFreq = prev + delta;
        const constrainedFreq = Math.max(
          MIN_FREQUENCY,
          Math.min(MAX_FREQUENCY, parseFloat(newFreq.toFixed(3)))
        );
        const freqRange = MAX_FREQUENCY - MIN_FREQUENCY;
        const newAltitude = (constrainedFreq - MIN_FREQUENCY) * (180 / freqRange);
        const newAzimuth = (constrainedFreq - MIN_FREQUENCY) * (360 / freqRange);
        debouncedSendAngles(newAltitude, newAzimuth);
        console.log(`Frequency adjusted to ${constrainedFreq} MHz`);
        return constrainedFreq;
      });
    },
    [debouncedSendAngles]
  );

  const adjustAltitude = useCallback(
    async (delta: number) => {
      if (!(await checkConnection(connectedDevice))) {
        Alert.alert("Error", "Device not connected");
        return;
      }
      const newAltitude = Math.max(0, Math.min(180, altitude + delta));
      debouncedSendAngles(newAltitude, azimuth);
      const freqRange = MAX_FREQUENCY - MIN_FREQUENCY;
      const newFrequency = MIN_FREQUENCY + (newAltitude / 180) * freqRange;
      setFrequency(parseFloat(newFrequency.toFixed(3)));
      console.log(`Altitude adjusted to ${newAltitude}°`);
    },
    [altitude, azimuth, debouncedSendAngles, connectedDevice, checkConnection]
  );

  const adjustAzimuth = useCallback(
    async (delta: number) => {
      if (!(await checkConnection(connectedDevice))) {
        Alert.alert("Error", "Device not connected");
        return;
      }
      const newAzimuth = Math.max(0, Math.min(360, azimuth + delta));
      debouncedSendAngles(altitude, newAzimuth);
      const freqRange = MAX_FREQUENCY - MIN_FREQUENCY;
      const newFrequency = MIN_FREQUENCY + (newAzimuth / 360) * freqRange;
      setFrequency(parseFloat(newFrequency.toFixed(3)));
      console.log(`Azimuth adjusted to ${newAzimuth}°`);
    },
    [altitude, azimuth, debouncedSendAngles, connectedDevice, checkConnection]
  );

  const handleSaveSignal = async () => {
    if (!signalName) {
      Alert.alert("Error", "Please enter a signal name");
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
      await AsyncStorage.setItem("savedSignals", JSON.stringify(updatedSignals));
      Alert.alert("Success", "Signal saved successfully!");
      console.log("Signal saved:", newSignal);
    } catch (error) {
      console.error("Error saving signal:", error);
      Alert.alert("Error", "Failed to save signal");
    }

    setSignalName("");
    setIsSaveModalVisible(false);
  };

  const handleFindSignal = () => {
    const alt = parseFloat(findAltitude);
    const az = parseFloat(findAzimuth);

    if (isNaN(alt) || isNaN(az)) {
      Alert.alert("Error", "Please enter valid altitude and azimuth values");
      return;
    }

    if (alt < 0 || alt > 180 || az < 0 || az > 360) {
      Alert.alert("Error", "Altitude must be 0-180° and Azimuth must be 0-360°");
      return;
    }

    debouncedSendAngles(alt, az);
    const freqRange = MAX_FREQUENCY - MIN_FREQUENCY;
    const newFrequency = MIN_FREQUENCY + (alt / 180) * freqRange;
    setFrequency(parseFloat(newFrequency.toFixed(3)));
    setIsFindModalVisible(false);
    setFindAltitude("");
    setFindAzimuth("");
    console.log(`Finding signal: alt=${alt}, az=${az}, freq=${newFrequency} MHz`);
  };

  const handleReset = async () => {
    if (!isMountedRef.current) return;

    setFrequency(MIN_FREQUENCY);
    setAltitude(90);
    setAzimuth(90);
    setIsPlaying(false);
    setIsRecording(false);
    recordedAudioRef.current = null;
    if (sound) {
      await sound.stopAsync();
      await sound.unloadAsync();
      setSound(null);
    }
    await debouncedSendAngles(90, 90);
    Alert.alert("Reset", "System reset to initial state");
    console.log("System reset");
  };

  const Waveform: React.FC<WaveformProps> = ({ data }) => (
    <View style={styles.waveformContainer} {...cursorPanResponder.panHandlers}>
      {data.map((amp, i) => (
        <View
          key={i}
          style={[styles.waveBar, { height: 2 + amp * 96 }]}
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

  const createWavBuffer = (samples: Int16Array, sampleRate: number): ArrayBuffer => {
    const bufferLength = samples.length * 2;
    const wavLength = 44 + bufferLength;
    const buffer = new ArrayBuffer(wavLength);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + bufferLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, "data");
    view.setUint32(40, bufferLength, true);

    for (let i = 0; i < samples.length; i++) {
      view.setInt16(44 + i * 2, samples[i], true);
    }

    return buffer;
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  };

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <View style={styles.backCircle}>
              <AntDesign name="arrowleft" size={20} color="white" />
            </View>
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            <Text style={styles.subtitle}>
              {deviceName || "Radio Telescope"}
            </Text>
          </View>
        </View>

        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <View style={styles.statusIconBG}>
              <View style={styles.statusIconInner} />
            </View>
            <Text style={styles.statusLabel}>STATUS</Text>
            <Text style={styles.statusValueGreen}>
              {isConnected === null
                ? "Checking..."
                : isConnected
                ? "Connected"
                : "Disconnected"}
            </Text>
          </View>
          <View style={styles.statusItem}>
            <FontAwesome5 name="wifi" size={20} color="white" />
            <Text style={styles.statusLabel}>SIGNAL</Text>
            <Text style={styles.statusValueGreen}>{signalStrength ?? "N/A"}</Text>
          </View>
          <View style={styles.statusItem}>
            <MaterialIcons name="battery-full" size={24} color="#34C759" />
            <Text style={styles.statusLabel}>BATTERY</Text>
            <Text style={styles.statusValue}>100%</Text>
          </View>
        </View>

        <View style={styles.coordsContainer}>
          <Text style={styles.coordsText}>
            ALTITUDE: {altitude.toFixed(1)}°
          </Text>
          <Text style={styles.coordsText}>AZIMUTH: {azimuth.toFixed(1)}°</Text>
        </View>

        <View
          style={styles.waveformArea}
          {...frequencyPanResponder.panHandlers}
        >
          <Text style={styles.frequencyText}>
            FREQUENCY: {frequency.toFixed(2)} MHz
          </Text>
          <View style={{ width: SCREEN_WIDTH }}>
            <Waveform data={waveformData} />
          </View>
          <View style={styles.playhead} />
          <Text style={styles.swipeHint}>
            ← Swipe left/right to adjust frequency →
          </Text>
        </View>

        <RTLSDRComponent frequency={frequency} onDataReceived={handleDataReceived} />

        <View style={styles.freqControls}>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(-COARSE_FREQUENCY_STEP)}
            onLongPress={() => startLongPress(adjustFrequency, -COARSE_FREQUENCY_STEP)}
            onPressOut={stopLongPress}
          >
            <Text style={styles.freqButtonText}>--</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(-FINE_FREQUENCY_STEP)}
            onLongPress={() => startLongPress(adjustFrequency, -FINE_FREQUENCY_STEP)}
            onPressOut={stopLongPress}
          >
            <Text style={styles.freqButtonText}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(FINE_FREQUENCY_STEP)}
            onLongPress={() => startLongPress(adjustFrequency, FINE_FREQUENCY_STEP)}
            onPressOut={stopLongPress}
          >
            <Text style={styles.freqButtonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.freqButton}
            onPress={() => adjustFrequency(COARSE_FREQUENCY_STEP)}
            onLongPress={() => startLongPress(adjustFrequency, COARSE_FREQUENCY_STEP)}
            onPressOut={stopLongPress}
          >
            <Text style={styles.freqButtonText}>++</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.dpadContainer}>
          <View style={[styles.dpadArm, styles.dpadHorizontalOutline]} />
          <View style={[styles.dpadArm, styles.dpadVerticalOutline]} />
          <View style={[styles.dpadArm, styles.dpadHorizontal]} />
          <View style={[styles.dpadArm, styles.dpadVertical]} />
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonUp]}
            onPress={() => adjustAltitude(ALTITUDE_STEP)}
            onLongPress={() => startLongPress(adjustAltitude, ALTITUDE_STEP)}
            onPressOut={stopLongPress}
          >
            <FontAwesome5 name="chevron-up" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonDown]}
            onPress={() => adjustAltitude(-ALTITUDE_STEP)}
            onLongPress={() => startLongPress(adjustAltitude, -ALTITUDE_STEP)}
            onPressOut={stopLongPress}
          >
            <FontAwesome5 name="chevron-down" size={24} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonLeft]}
            onPress={() => adjustAzimuth(-AZIMUTH_STEP)}
            onLongPress={() => startLongPress(adjustAzimuth, -AZIMUTH_STEP)}
            onPressOut={stopLongPress}
          >
            <FontAwesome5 name="undo" size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dpadButton, styles.dpadButtonRight]}
            onPress={() => adjustAzimuth(AZIMUTH_STEP)}
            onLongPress={() => startLongPress(adjustAzimuth, AZIMUTH_STEP)}
            onPressOut={stopLongPress}
          >
            <FontAwesome5 name="redo" size={20} color="white" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.centerButton}>
            <View style={styles.centerButtonGlow}>
              <View style={styles.centerButtonCore} />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={styles.bottomButtonCircle}
            onPress={() => setIsSaveModalVisible(true)}
          >
            <Text style={styles.bottomButtonText}>SAVE SIGNAL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButtonCirclePurple}
            onPress={() => setIsFindModalVisible(true)}
          >
            <Text style={styles.bottomButtonText}>FIND SIGNAL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.bottomButtonCircleRed}
            onPress={handleReset}
          >
            <Text style={styles.bottomButtonText}>RESET</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleStop}>
            <MaterialIcons name="stop-circle" size={50} color="#FF6B6B" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.recPauseButton}
            onPress={handlePlayPause}
          >
            <Ionicons
              name={isPlaying ? "pause" : "play"}
              size={24}
              color="white"
            />
          </TouchableOpacity>
        </View>

        <Modal visible={isSaveModalVisible} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Save Signal</Text>
              <TextInput
                style={styles.input}
                placeholder="Signal Name"
                placeholderTextColor="#666"
                value={signalName}
                onChangeText={setSignalName}
              />
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setIsSaveModalVisible(false)}
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

        <Modal visible={isFindModalVisible} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Find Signal</Text>
              <TextInput
                style={styles.input}
                placeholder="Altitude (0-180°)"
                placeholderTextColor="#666"
                value={findAltitude}
                onChangeText={setFindAltitude}
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                placeholder="Azimuth (0-360°)"
                placeholderTextColor="#666"
                value={findAzimuth}
                onChangeText={setFindAzimuth}
                keyboardType="numeric"
              />
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  style={styles.modalButton}
                  onPress={() => setIsFindModalVisible(false)}
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
  container: { flex: 1, backgroundColor: "#121212", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 15,
    paddingTop: 30,
  },
  backButton: { margin: 2 },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "white",
    justifyContent: "center",
    alignItems: "center",
  },
  titleContainer: { flex: 1, alignItems: "center", marginRight: 40 },
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
  statusItem: { alignItems: "center" },
  statusLabel: { color: "white", fontSize: 12, marginTop: 4 },
  statusValue: { color: "white", fontSize: 14, fontWeight: "bold" },
  statusValueGreen: { color: "#34C759", fontSize: 14, fontWeight: "bold" },
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
    backgroundColor: "#FF833A",
  },
  coordsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "90%",
    marginTop: 15,
  },
  coordsText: { color: "#FF833A", fontSize: 14, fontFamily: "Shantell" },
  waveformArea: {
    height: 220,
    marginTop: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  waveformContainer: {
    width: SCREEN_WIDTH,
    height: 150,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-evenly",
    paddingBottom: 10,
    position: "relative",
  },
  waveBar: { backgroundColor: "white", width: 2 },
  playhead: {
    position: "absolute",
    left: "50%",
    height: "70%",
    width: 3,
    backgroundColor: "#FF833A",
    marginLeft: -1.5,
    borderRadius: 2,
    top: 30,
  },
  cursor: {
    position: "absolute",
    height: 100,
    width: 3,
    backgroundColor: "#34C759",
    borderRadius: 2,
    zIndex: 10,
  },
  frequencyText: {
    color: "#FF833A",
    fontSize: 16,
    marginBottom: 10,
    fontFamily: "Shantell",
  },
  swipeHint: { color: "#666", fontSize: 12, marginTop: 5, fontStyle: "italic" },
  freqControls: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "80%",
    marginVertical: 15,
  },
  freqButton: {
    backgroundColor: "#FF833A",
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
    backgroundColor: "#FF833A",
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
    backgroundColor: "#FF3B30",
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
    backgroundColor: "#FF833A",
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
    borderColor: "#FF833A",
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
    paddingHorizontal: 10,
    marginBottom: 15,
  },
  modalButtonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
  },
  modalButton: {
    backgroundColor: "#FF833A",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  modalButtonText: {
    color: "white",
    fontSize: 16,
  },
  dpadContainer: {
    width: DPAD_SIZE,
    height: DPAD_SIZE,
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
    height: ARM_THICKNESS,
    backgroundColor: ACCENT_COLOR_ORANGE,
  },
  dpadVertical: {
    width: ARM_THICKNESS,
    height: "100%",
    backgroundColor: ACCENT_COLOR_ORANGE,
  },
  dpadHorizontalOutline: {
    width: "103%",
    height: ARM_THICKNESS + 6,
    backgroundColor: OUTLINE_COLOR_BLUE,
  },
  dpadVerticalOutline: {
    width: ARM_THICKNESS + 6,
    height: "103%",
    backgroundColor: OUTLINE_COLOR_BLUE,
  },
  dpadButton: {
    position: "absolute",
    justifyContent: "center",
    alignItems: "center",
    width: ARM_THICKNESS,
    height: ARM_THICKNESS,
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
    width: DPAD_SIZE * 0.4,
    height: DPAD_SIZE * 0.4,
    justifyContent: "center",
    alignItems: "center",
  },
  centerButtonGlow: {
    width: "100%",
    height: "100%",
    borderRadius: (DPAD_SIZE * 0.4) / 2,
    backgroundColor: "black",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: ACCENT_COLOR_ORANGE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 15,
  },
  centerButtonCore: {
    width: "70%",
    height: "70%",
    borderRadius: (DPAD_SIZE * 0.4 * 0.7) / 2,
    backgroundColor: "black",
    borderWidth: 4,
    borderColor: ACCENT_COLOR_ORANGE,
  },
});

export default FreeUseMode;