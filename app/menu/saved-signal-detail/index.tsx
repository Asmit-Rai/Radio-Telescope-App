import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, useWindowDimensions, FlatList, ImageBackground, Alert } from 'react-native';
import { MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { useBLE } from '../../../context/BLEContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RTLSDRComponent from '../../../components/RTLSDRComponent';

// Rate limiting constants
const MAX_COMMANDS_PER_SECOND = 10;
const COMMAND_DEBOUNCE_DELAY = 300;
const CONNECTION_CHECK_INTERVAL = 30000;

// RSSI thresholds for signal strength
const RSSI_EXCELLENT = -65;
const RSSI_GOOD = -85;
const RSSI_WEAK = -95;

type SavedSignal = {
  name: string;
  frequency: number;
  altitude: number;
  azimuth: number;
  audioBase64?: string;
};

interface WaveformProps {
  data: number[];
}

interface CommandQueueItem {
  alt: number;
  az: number;
  timestamp: number;
  priority: number; // 0 = highest priority
}

// Rate Limiter Class
class CommandRateLimiter {
  private commandTimes: number[] = [];
  private readonly maxCommandsPerSecond: number;

  constructor(maxCommandsPerSecond: number = MAX_COMMANDS_PER_SECOND) {
    this.maxCommandsPerSecond = maxCommandsPerSecond;
  }

  canExecuteCommand(): boolean {
    const now = Date.now();
    this.commandTimes = this.commandTimes.filter(time => now - time < 1000);
    if (this.commandTimes.length >= this.maxCommandsPerSecond) {
      return false;
    }
    this.commandTimes.push(now);
    return true;
  }

  reset(): void {
    this.commandTimes = [];
  }
}

const SavedSignalDetail: React.FC = memo(() => {
  const { name, frequency, altitude, azimuth } = useLocalSearchParams<{ name: string; frequency: string; altitude: string; azimuth: string }>();
  const { connectedDevice, writeData, checkConnection, getRSSI } = useBLE();
  const [status, setStatus] = useState<string>('Checking...');
  const [rssi, setRssi] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState<boolean>(true);
  const [hasSentAngles, setHasSentAngles] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [allSignals, setAllSignals] = useState<SavedSignal[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const isMountedRef = useRef<boolean>(true);
  const lastAnglesRef = useRef<{ alt: number; az: number } | null>(null);
  const commandQueue = useRef<CommandQueueItem[]>([]);
  const isProcessingCommand = useRef<boolean>(false);
  const rateLimiter = useRef<CommandRateLimiter>(new CommandRateLimiter());
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const barCount = useMemo(() => Math.floor(SCREEN_WIDTH / 4), [SCREEN_WIDTH]);

  const signal = useRef<SavedSignal>({
    name: decodeURIComponent(name || 'Unknown'),
    frequency: parseFloat(frequency || '0'),
    altitude: parseFloat(altitude || '90'),
    azimuth: parseFloat(azimuth || '90'),
    audioBase64: undefined,
  });

  const Waveform = React.memo(({ data }: WaveformProps) => {
    return (
      <FlatList
        data={data}
        keyExtractor={(_, index) => index.toString()}
        horizontal
        contentContainerStyle={[styles.visualizerContainer, { alignItems: 'flex-end' }]}
        renderItem={({ item }) => <View style={[styles.visualizerBar, { height: item * 100 + 10 }]} />}
      />
    );
  });
  Waveform.displayName = 'Waveform';

  useEffect(() => {
    const loadAllSignals = async () => {
      try {
        const saved = await AsyncStorage.getItem('savedSignals');
        if (saved) {
          const signals = JSON.parse(saved) as SavedSignal[];
          setAllSignals(signals);
          const currentFreq = parseFloat(frequency || '0');
          const index = signals.findIndex((s: SavedSignal) => s.frequency === currentFreq);
          setCurrentIndex(index >= 0 ? index : 0);
        }
      } catch (error) {
        console.error('Error loading signals:', error);
        Alert.alert('Error', 'Failed to load saved signals.');
      }
    };
    loadAllSignals();
  }, [frequency]);

  const handleDataReceived = useCallback((samples: number[]) => {
    const newData = new Array(barCount).fill(0).map((_, i) => {
      const index = Math.floor((i / barCount) * (samples.length / 2)) * 2;
      const iSample = samples[index] || 0;
      const qSample = samples[index + 1] || 0;
      return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
    });
    if (isMountedRef.current) {
      setWaveformData(prev => {
        const hasChanged = newData.some((val, idx) => Math.abs(val - prev[idx]) > 0.01);
        return hasChanged ? newData : prev;
      });
    }
  }, [barCount]);

  const processCommandQueue = useCallback(async () => {
    if (isProcessingCommand.current || commandQueue.current.length === 0 || !rateLimiter.current.canExecuteCommand()) {
      if (commandQueue.current.length > 0 && !isProcessingCommand.current) {
        setTimeout(processCommandQueue, 100);
      }
      return;
    }

    isProcessingCommand.current = true;
    const command = commandQueue.current.shift()!;
    const { alt, az } = command;

    try {
      const success = await writeData(alt, az);
      if (!success) {
        throw new Error('Write failed');
      }
      if (isMountedRef.current) {
        lastAnglesRef.current = { alt, az };
        console.log(`Sent angles: Alt=${alt}, Az=${az}`);
      }
    } catch (error) {
      console.error('BLE error:', error);
      Alert.alert('Error', 'Failed to send angles');
      if (isMountedRef.current) {
        setStatus('Disconnected');
        setRssi(null);
      }
    } finally {
      isProcessingCommand.current = false;
      if (commandQueue.current.length > 0) {
        setTimeout(processCommandQueue, 50);
      }
    }
  }, [writeData]);

  const sendAngles = useCallback(async (alt: number, az: number, priority: number = 1) => {
    if (!connectedDevice || !writeData || !isMountedRef.current || !isTracking) {
      console.log('BLE not ready or tracking stopped');
      return;
    }
    const constrainedAlt = Math.max(0, Math.min(180, Math.round(alt)));
    const constrainedAz = Math.max(0, Math.min(360, Math.round(az)));
    if (
      lastAnglesRef.current &&
      Math.abs(lastAnglesRef.current.alt - constrainedAlt) < 1 &&
      Math.abs(lastAnglesRef.current.az - constrainedAz) < 1
    ) {
      console.log('Angles unchanged (within tolerance), skipping write');
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      const command: CommandQueueItem = {
        alt: constrainedAlt,
        az: constrainedAz,
        timestamp: Date.now(),
        priority,
      };
      commandQueue.current.push(command);
      commandQueue.current.sort((a, b) => a.priority - b.priority);
      processCommandQueue();
    }, COMMAND_DEBOUNCE_DELAY);
  }, [connectedDevice, writeData, isTracking, processCommandQueue]);

  const stopTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsTracking(false);
    setIsPlaying(false);
    commandQueue.current = [];
    rateLimiter.current.reset();
    await sendAngles(90, 90, 0); // High priority stop command
    console.log('Tracking stopped');
  }, [sendAngles]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    const checkStatus = async () => {
      if (!isMountedRef.current || !connectedDevice) {
        if (isMountedRef.current) {
          setStatus('Disconnected');
          setRssi(null);
        }
        return;
      }
      try {
        const connection = await checkConnection(connectedDevice);
        const rssiValue = connection ? await getRSSI() : null;
        if (isMountedRef.current) {
          setStatus(prev => prev !== (connection ? 'Connected' : 'Disconnected') ? (connection ? 'Connected' : 'Disconnected') : prev);
          setRssi(rssiValue);
          console.log(`Connection check: connected=${connection}, RSSI=${rssiValue}`);
        }
      } catch (error) {
        console.error('Connection check error:', error);
        if (isMountedRef.current) {
          setStatus('Disconnected');
          setRssi(null);
        }
      }
    };
    checkStatus();
    interval = setInterval(checkStatus, CONNECTION_CHECK_INTERVAL);
    return () => {
      clearInterval(interval);
      console.log('Connection check interval cleared');
    };
  }, [connectedDevice, checkConnection, getRSSI]);

  useEffect(() => {
    isMountedRef.current = true;
    if (!connectedDevice) {
      Alert.alert('Error', 'No BLE device connected', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
      console.log('No BLE device connected');
      return;
    }
    if (hasSentAngles) return;

    const initialize = async () => {
      if (!isMountedRef.current || !isTracking) return;
      await sendAngles(signal.current.altitude, signal.current.azimuth, 0);
      if (isMountedRef.current) {
        setHasSentAngles(true);
      }
    };

    initialize().catch((error) => console.error('Initialization error:', error));

    return () => {
      isMountedRef.current = false;
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      commandQueue.current = [];
      rateLimiter.current.reset();
      console.log('SavedSignalDetail unmounted, cleaned up resources');
    };
  }, [connectedDevice, sendAngles, hasSentAngles, isTracking]);

  const handlePlayPause = useCallback(() => {
    setIsPlaying((prev) => {
      const newState = !prev;
      console.log(`Recording ${newState ? 'started' : 'paused'}`);
      return newState;
    });
  }, []);

  const handleNextSignal = useCallback(() => {
    if (allSignals.length > 0) {
      const nextIndex = (currentIndex + 1) % allSignals.length;
      setCurrentIndex(nextIndex);
      const nextSignal = allSignals[nextIndex];
      router.replace(`/menu/saved-signal-detail?name=${encodeURIComponent(nextSignal.name)}&frequency=${nextSignal.frequency}&altitude=${nextSignal.altitude}&azimuth=${nextSignal.azimuth}`);
    } else {
      Alert.alert('Info', 'No other signals available.');
    }
  }, [allSignals, currentIndex]);

  const signalStatusText = useMemo(() => {
    if (!status || rssi === null) return "N/A";
    if (rssi >= RSSI_EXCELLENT) return "Excellent";
    if (rssi >= RSSI_GOOD) return "Good";
    if (rssi >= RSSI_WEAK) return "Weak";
    return "Poor";
  }, [status, rssi]);

  const daisyChainStatusText = useMemo(() => {
    return status === 'Connected' ? "Active" : "Inactive";
  }, [status]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require("../../../assets/background/target-tracking-bg.png")}
        style={styles.backgroundImage}
        onError={(error) => console.error('Image load error:', error)}
      >
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Feather name="arrow-left" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{signal.current.name}</Text>
          </View>

          <View style={styles.statusContainer}>
            <View style={styles.statusItem}>
              <View style={styles.statusIconCircle}>
                <View style={styles.statusIconInnerCircle} />
              </View>
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={styles.statusValueGreen}>{status}</Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="wifi" size={24} color="white" />
              <Text style={styles.statusLabel}>SIGNAL</Text>
              <Text style={styles.statusValueGreen}>{signalStatusText} {rssi !== null ? `(${rssi} dBm)` : ''}</Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="access-point-network" size={24} color="white" />
              <Text style={styles.statusLabel}>DAISY CHAIN</Text>
              <Text style={styles.statusValueGreen}>{daisyChainStatusText}</Text>
            </View>
          </View>

          <View style={styles.planetContainer}>
            <RTLSDRComponent
              frequency={signal.current.frequency}
              onDataReceived={handleDataReceived}
            />
            <Waveform data={waveformData} />
          </View>

          <View style={styles.detailsContainer}>
            <Text style={styles.detailsTitle}>DETAILS</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>RIGHT ASCENSION (RA):</Text>
              <Text style={styles.detailValue}>N/A</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DECLINATION (DEC):</Text>
              <Text style={styles.detailValue}>N/A</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ALTITUDE (Alt):</Text>
              <Text style={styles.detailValue}>{signal.current.altitude.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>AZIMUTH (Az):</Text>
              <Text style={styles.detailValue}>{signal.current.azimuth.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>FREQUENCY:</Text>
              <Text style={styles.detailValue}>{signal.current.frequency} MHz</Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

          <View style={styles.footer}>
            <View style={styles.footerButtons}>
              <TouchableOpacity style={styles.smallButton} onPress={handleNextSignal}>
                <Text style={styles.smallButtonText}>NEXT{"\n"}SIGNAL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={stopTracking}>
                <View style={styles.stopIconOuter}>
                  <View style={styles.stopIconInner} />
                </View>
                <Text style={styles.iconButtonText}>STOP</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.recButton} onPress={handlePlayPause}>
                <MaterialCommunityIcons name={isPlaying ? "pause" : "record"} size={32} color="white" />
                <Text style={styles.recButtonText}>{isPlaying ? "PAUSE" : "REC"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
});

SavedSignalDetail.displayName = 'SavedSignalDetail';

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  backButton: {
    backgroundColor: '#121212',
    padding: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'white',
  },
  headerTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginLeft: 15,
    lineHeight: 26,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 10,
  },
  statusItem: {
    alignItems: 'center',
  },
  statusIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF8C2B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusIconInnerCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF8C2B',
  },
  statusLabel: {
    color: 'white',
    fontFamily: 'Shantell',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 5,
  },
  statusValueGreen: {
    color: '#34C759',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginTop: 2,
  },
  planetContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 15,
  },
  visualizerContainer: {
    height: 150,
  },
  visualizerBar: {
    width: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: 10,
    marginHorizontal: 3,
  },
  detailsContainer: {
    marginTop: 40,
    borderRadius: 20,
    padding: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: '#FF833A',
    borderStyle: 'dashed',
  },
  detailsTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    alignSelf: 'center',
    marginBottom: 40,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    width: '100%',
  },
  detailLabel: {
    color: '#FF8C2B',
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    fontSize: 15,
  },
  detailValue: {
    color: 'white',
    fontFamily: 'Shantell',
    fontSize: 15,
  },
  footer: {
    paddingBottom: 10,
    borderTopColor: '#FF833A',
    borderTopWidth: 2,
    paddingTop: 15,
    borderStyle: 'dashed',
  },
  footerButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    position: 'relative',
    paddingBottom: 55,
  },
  smallButton: {
    width: 120,
    height: 65,
    borderRadius: 32,
    backgroundColor: '#FF833A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  smallButtonText: {
    color: 'white',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
  },
  iconButton: {
    alignItems: 'center',
  },
  iconButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginTop: 5,
  },
  stopIconOuter: {
    width: 40,
    height: 40,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#FF6464',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopIconInner: {
    width: 10,
    height: 10,
    backgroundColor: '#FF6464',
  },
  recButton: {
    backgroundColor: '#FF833A',
    borderRadius: 30,
    paddingVertical: 15,
    paddingHorizontal: 25,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  recButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'Shantell',
    marginLeft: 8,
  },
});

export default SavedSignalDetail;