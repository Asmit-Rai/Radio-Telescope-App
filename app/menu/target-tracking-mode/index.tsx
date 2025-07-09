import React, { 
  useState, 
  useEffect, 
  useCallback, 
  useRef, 
  useMemo,
  memo 
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ImageBackground,
} from "react-native";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useBLE } from "../../../context/BLEContext";
import * as Astronomy from "astronomy-engine";
import STRComponent from "../../../components/STRComponent";

// Rate limiting constants
const MAX_COMMANDS_PER_SECOND = 10;
const COMMAND_DEBOUNCE_DELAY = 300;
const CONNECTION_CHECK_INTERVAL = 30000;

// Rate limiter class
class CommandRateLimiter {
  private commandTimestamps: number[] = [];
  private readonly maxCommands: number;
  private readonly timeWindow: number;

  constructor(maxCommands: number = MAX_COMMANDS_PER_SECOND, timeWindow: number = 1000) {
    this.maxCommands = maxCommands;
    this.timeWindow = timeWindow;
  }

  canExecuteCommand(): boolean {
    const now = Date.now();
    // Remove timestamps older than the time window
    this.commandTimestamps = this.commandTimestamps.filter(
      timestamp => now - timestamp < this.timeWindow
    );
    
    // Check if we can execute another command
    if (this.commandTimestamps.length < this.maxCommands) {
      this.commandTimestamps.push(now);
      return true;
    }
    
    return false;
  }

  reset(): void {
    this.commandTimestamps = [];
  }
}

// RSSI thresholds for signal strength
const RSSI_EXCELLENT = -65;
const RSSI_GOOD = -85;
const RSSI_WEAK = -95;

// --- Interfaces ---
interface Target {
  id: number;
  name: string;
  frequency: string;
  ra: string;
  dec: string;
  type?: string;
}

interface AudioVisualizerProps {
  data: number[];
}

interface CommandQueueItem {
  alt: number;
  az: number;
  timestamp: number;
  priority: number; // 0 = highest priority
}

// --- Helper Components ---
const AudioVisualizer: React.FC<AudioVisualizerProps> = memo(({ data }) => {
  const visualizerBars = useMemo(() => 
    data.map((height, index) => (
      <View 
        key={index} 
        style={[styles.visualizerBar, { height: height * 100 + 10 }]} 
      />
    )), [data]
  );

  return (
    <View style={styles.visualizerContainer}>
      {visualizerBars}
    </View>
  );
});

AudioVisualizer.displayName = 'AudioVisualizer';

// --- Main Component ---
const TargetDetail: React.FC = memo(() => {
  const { target } = useLocalSearchParams<{ target: string }>();
  const { connectedDevice, writeData, checkConnection, getUserLocation, getRSSI } = useBLE();
  
  // State with functional updates to prevent unnecessary re-renders
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTracking, setIsTracking] = useState<boolean>(true);
  const [hasSentAngles, setHasSentAngles] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [currentAngles, setCurrentAngles] = useState({ azimuth: 0, altitude: 0 });
  const [frequency, setFrequency] = useState<number>(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [rssi, setRssi] = useState<number | null>(null);
  const [sdrError, setSdrError] = useState<string | null>(null);
  const [isSDRConnected, setIsSDRConnected] = useState<boolean>(false);
  const [sdrConnectionChecked, setSdrConnectionChecked] = useState<boolean>(false);

  // Refs for values that don't need to trigger re-renders
  const isMountedRef = useRef<boolean>(true);
  const lastAnglesRef = useRef<{ alt: number; az: number } | null>(null);
  const commandQueue = useRef<CommandQueueItem[]>([]);
  const isProcessingCommand = useRef<boolean>(false);
  const rateLimiter = useRef<CommandRateLimiter>(new CommandRateLimiter());
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const processQueueTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse target once with memoization
  const parsedTarget = useMemo<Target | null>(() => {
    try {
      return target ? JSON.parse(target) : null;
    } catch (error) {
      console.error("Error parsing target:", error);
      return null;
    }
  }, [target]);

  // Extract frequency and determine target type from parsed target
  const targetFrequency = useMemo(() => {
    if (!parsedTarget) return 20.1; // Default frequency
    
    // Extract numeric frequency from frequency string
    const freqMatch = parsedTarget.frequency.match(/(\d+(?:\.\d+)?)/);
    return freqMatch ? parseFloat(freqMatch[1]) : 20.1;
  }, [parsedTarget]);

  const targetPlanet = useMemo(() => {
    if (!parsedTarget) return 'jupiter';
    
    const targetType = parsedTarget.type?.toLowerCase() || '';
    const targetName = parsedTarget.name?.toLowerCase() || '';
    
    // Determine planet/target type based on target data
    if (targetName.includes('jupiter') || targetType.includes('jupiter')) {
      return 'jupiter';
    } else if (targetName.includes('sun') || targetType.includes('solar')) {
      return 'sun';
    } else if (targetName.includes('saturn') || targetType.includes('saturn')) {
      return 'saturn';
    } else {
      return 'galactic'; // Default for other astronomical objects
    }
  }, [parsedTarget]);

  // Alert for invalid target (separate effect to prevent blocking)
  useEffect(() => {
    if (!parsedTarget) {
      Alert.alert("Error", "No target selected", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [parsedTarget]);

  // Memoized coordinate conversion using user location
  const convertToAltAz = useCallback(async (targetData: Target) => {
    const { name, ra, dec } = targetData;
    const date = new Date();
    let latitude: number, longitude: number;

    try {
      const location = await getUserLocation();
      const [lat, lon] = location.split(',').map(coord => parseFloat(coord.trim()));
      if (isNaN(lat) || isNaN(lon)) {
        throw new Error("Invalid location coordinates");
      }
      latitude = lat;
      longitude = lon;
    } catch (error) {
      console.error("Error getting user location, using default:", error);
      latitude = 28.6139; // Default to Delhi
      longitude = 77.209;
    }

    const observer = new Astronomy.Observer(latitude, longitude, 0);

    try {
      // Handle celestial bodies
      if (["Sun", "Jupiter"].includes(name)) {
        const vector = Astronomy.GeoVector(name as Astronomy.Body, date, true);
        const equatorial = Astronomy.EquatorFromVector(vector);
        const horizontal = Astronomy.Horizon(
          date,
          observer,
          equatorial.ra,
          equatorial.dec,
          "normal"
        );
        return { azimuth: horizontal.azimuth, altitude: horizontal.altitude };
      }

      // Handle dynamic coordinates
      if (
        ["Varies", "Dynamic", "Local", "Sweep"].includes(ra) ||
        ["Varies", "Dynamic", "Local", "Sweep"].includes(dec)
      ) {
        console.log(`Dynamic coordinates for ${name}, using default position`);
        return { azimuth: 90, altitude: 90 };
      }

      // Parse RA/Dec coordinates
      const raParts = ra.match(/\d+(\.\d+)?/g)?.map(Number);
      if (!raParts || raParts.length === 0) {
        throw new Error(`Invalid RA format for ${name}: ${ra}`);
      }
      const raTotalHours =
        (raParts[0] || 0) + (raParts[1] || 0) / 60 + (raParts[2] || 0) / 3600;

      const decSign = dec.trim().startsWith("-") ? -1 : 1;
      const decParts = dec.match(/\d+(\.\d+)?/g)?.map(Number);
      if (!decParts || decParts.length === 0) {
        throw new Error(`Invalid Dec format for ${name}: ${dec}`);
      }
      let decDegrees =
        (decParts[0] || 0) +
        (decParts[1] || 0) / 60 +
        (decParts[2] || 0) / 3600;
      decDegrees *= decSign;

      if (isNaN(raTotalHours) || isNaN(decDegrees)) {
        throw new Error(`Could not parse coordinates for ${name}`);
      }

      const horizontal = Astronomy.Horizon(
        date,
        observer,
        raTotalHours,
        decDegrees,
        "normal"
      );
      return { azimuth: horizontal.azimuth, altitude: horizontal.altitude };
    } catch (error) {
      console.error(`Conversion error for ${name}:`, error);
      Alert.alert(
        "Coordinate Conversion Error",
        `Failed to convert coordinates for ${name}. Using default position.`,
        [{ text: "OK" }]
      );
      return { azimuth: 90, altitude: 90 };
    }
  }, [getUserLocation]);

  // Process command queue with rate limiting - Fixed timeout management
  const processCommandQueue = useCallback(async () => {
    if (
      isProcessingCommand.current || 
      commandQueue.current.length === 0 ||
      !rateLimiter.current.canExecuteCommand()
    ) {
      // If rate limited, try again after a short delay
      if (commandQueue.current.length > 0 && !isProcessingCommand.current) {
        if (processQueueTimeoutRef.current) {
          clearTimeout(processQueueTimeoutRef.current);
        }
        processQueueTimeoutRef.current = setTimeout(processCommandQueue, 100);
      }
      return;
    }

    isProcessingCommand.current = true;
    const command = commandQueue.current.shift()!;
    const { alt, az } = command;

    try {
      const success = await writeData(alt, az);
      if (!success) {
        throw new Error("Write failed");
      }
      
      if (isMountedRef.current) {
        // Batch state updates
        setCurrentAngles(prev => {
          if (prev.altitude !== alt || prev.azimuth !== az) {
            return { altitude: alt, azimuth: az };
          }
          return prev;
        });
        lastAnglesRef.current = { alt, az };
        console.log(`Sent angles: Alt=${alt}, Az=${az}`);
      }
    } catch (error) {
      console.error("BLE error:", error);
      Alert.alert("Error", "Failed to send angles");
      if (isMountedRef.current) {
        setIsConnected(false);
      }
    } finally {
      isProcessingCommand.current = false;
      // Process next command if queue not empty
      if (commandQueue.current.length > 0) {
        if (processQueueTimeoutRef.current) {
          clearTimeout(processQueueTimeoutRef.current);
        }
        processQueueTimeoutRef.current = setTimeout(processCommandQueue, 50);
      }
    }
  }, [writeData]);

  // Debounced angle sending with rate limiting
  const sendAnglesDebounced = useCallback(
    (alt: number, az: number, priority: number = 1) => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }

      debounceTimeoutRef.current = setTimeout(() => {
        if (!connectedDevice || !writeData || !isMountedRef.current || !isTracking) {
          console.log("BLE not ready or tracking stopped");
          return;
        }

        const constrainedAlt = Math.max(0, Math.min(180, Math.round(alt)));
        const constrainedAz = Math.max(0, Math.min(360, Math.round(az)));

        // Skip if angles haven't changed significantly (within 1 degree)
        if (
          lastAnglesRef.current &&
          Math.abs(lastAnglesRef.current.alt - constrainedAlt) < 1 &&
          Math.abs(lastAnglesRef.current.az - constrainedAz) < 1
        ) {
          console.log("Angles unchanged (within tolerance), skipping write");
          return;
        }

        // Add command to priority queue
        const command: CommandQueueItem = {
          alt: constrainedAlt,
          az: constrainedAz,
          timestamp: Date.now(),
          priority
        };

        commandQueue.current.push(command);
        commandQueue.current.sort((a, b) => a.priority - b.priority); // Sort by priority
        processCommandQueue();
      }, COMMAND_DEBOUNCE_DELAY);
    },
    [connectedDevice, writeData, isTracking, processCommandQueue]
  );

  // Enhanced SDR error handling function
  const handleSDRError = useCallback((errorMessage: string) => {
    console.error("SDR Error:", errorMessage);
    if (isMountedRef.current) {
      setSdrError(errorMessage);
      setIsSDRConnected(false);
      setWaveformData([]);
    }
  }, []);

  // Handle SDR data with enhanced connection detection
  const handleDataReceived = useCallback((samples: readonly number[]) => {
    try {
      if (!samples || samples.length === 0) {
        throw new Error("No SDR data received");
      }

      // Validate data integrity
      const validSamples = samples.filter(sample => 
        typeof sample === 'number' && !isNaN(sample) && isFinite(sample)
      );
      
      if (validSamples.length < samples.length * 0.8) {
        throw new Error("Invalid SDR data - too many corrupted samples");
      }

      const newData = new Array(14).fill(0).map((_, i) => {
        const index = Math.floor((i / 14) * (validSamples.length / 2)) * 2;
        const iSample = validSamples[index] || 0;
        const qSample = validSamples[index + 1] || 0;
        return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
      });

      if (isMountedRef.current) {
        setWaveformData(prevData => {
          const hasChanged = newData.some((val, idx) => Math.abs(val - (prevData[idx] || 0)) > 0.01);
          return hasChanged ? newData : prevData;
        });
        setSdrError(null);
        setIsSDRConnected(true);
        setSdrConnectionChecked(true);
      }
    } catch (error) {
      console.error("SDR data processing error:", error);
      handleSDRError(error instanceof Error ? error.message : "SDR data processing failed");
    }
  }, [handleSDRError]);

  // Enhanced SDR connection monitoring
  const monitorSDRConnection = useCallback(() => {
    const SDR_TIMEOUT = 8000; // 8 seconds timeout
    let lastDataTime = Date.now();
    let connectionCheckTimeout: NodeJS.Timeout;
    
    const checkSDRStatus = () => {
      const now = Date.now();
      if (now - lastDataTime > SDR_TIMEOUT) {
        if (isSDRConnected) {
          handleSDRError("SDR connection timeout - no data received");
        } else if (!sdrConnectionChecked) {
          // Initial connection check failed
          handleSDRError("SDR device not detected or not responding");
          setSdrConnectionChecked(true);
        }
      }
    };

    // Monitor data reception
    const originalHandleData = handleDataReceived;
    const monitoredHandleData = (samples: readonly number[]) => {
      lastDataTime = Date.now();
      originalHandleData(samples);
    };

    // Check SDR status periodically
    const statusInterval = setInterval(checkSDRStatus, 2000);
    
    // Initial connection check after a delay
    connectionCheckTimeout = setTimeout(() => {
      if (!isSDRConnected && !sdrConnectionChecked) {
        handleSDRError("SDR device not responding - check connection");
        setSdrConnectionChecked(true);
      }
    }, 5000);

    return { 
      monitoredHandleData, 
      cleanup: () => {
        clearInterval(statusInterval);
        clearTimeout(connectionCheckTimeout);
      }
    };
  }, [handleDataReceived, isSDRConnected, sdrConnectionChecked, handleSDRError]);

  // Initialize SDR monitoring
  useEffect(() => {
    const { cleanup } = monitorSDRConnection();
    return cleanup;
  }, [monitorSDRConnection]);

  // Stop tracking with cleanup
  const stopTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    
    setIsTracking(false);
    setIsRecording(false);
    
    // Clear command queue and send stop command with highest priority
    commandQueue.current = [];
    rateLimiter.current.reset();
    
    await sendAnglesDebounced(90, 90, 0); // Priority 0 for stop command
    console.log("Tracking stopped");
  }, [sendAnglesDebounced]);

  // Optimized connection monitoring with RSSI
  const checkConnectionStatus = useCallback(async () => {
    if (!isMountedRef.current || !connectedDevice) {
      if (isMountedRef.current) {
        setIsConnected(false);
        setRssi(null);
      }
      return;
    }

    try {
      const connection = await checkConnection(connectedDevice);
      const rssiValue = connection ? await getRSSI() : null;
      if (isMountedRef.current) {
        setIsConnected(prevConnection => {
          return prevConnection !== connection ? connection : prevConnection;
        });
        setRssi(rssiValue);
      }
    } catch (error) {
      console.error("Connection check error:", error);
      if (isMountedRef.current) {
        setIsConnected(false);
        setRssi(null);
      }
    }
  }, [connectedDevice, checkConnection, getRSSI]);

  // Connection monitoring with proper cleanup
  useEffect(() => {
    checkConnectionStatus();
    
    const scheduleNextCheck = () => {
      connectionCheckTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          checkConnectionStatus().then(scheduleNextCheck);
        }
      }, CONNECTION_CHECK_INTERVAL);
    };

    scheduleNextCheck();

    return () => {
      // Store the current rateLimiter value to use in cleanup
      const rateLimiterInstance = rateLimiter.current;
      if (connectionCheckTimeoutRef.current) {
        clearTimeout(connectionCheckTimeoutRef.current);
      }
      rateLimiterInstance.reset();
    };
  }, [checkConnectionStatus]);

  // Initialization with proper dependency management - FIXED: No coordinate changes allowed
  useEffect(() => {
    if (!parsedTarget || hasSentAngles || !connectedDevice) {
      if (!connectedDevice && parsedTarget) {
        Alert.alert("Error", "No BLE device connected", [
          { text: "OK", onPress: () => router.replace("/") },
        ]);
      }
      return;
    }

    const initialize = async () => {
      if (!isMountedRef.current || !isTracking) return;

      try {
        // Use SAVED frequency from target data - no modifications
        setFrequency(prevFreq => prevFreq !== targetFrequency ? targetFrequency : prevFreq);

        // Convert SAVED coordinates and send angles - no modifications allowed
        const { azimuth: az, altitude: alt } = await convertToAltAz(parsedTarget);
        await sendAnglesDebounced(alt, az, 0); // High priority for initial positioning
        
        setHasSentAngles(true);
        console.log(`Tracking SAVED signal: ${parsedTarget.name}, Frequency=${targetFrequency}MHz, Alt=${alt}°, Az=${az}°`);
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();
  }, [parsedTarget, connectedDevice, isTracking, hasSentAngles, convertToAltAz, sendAnglesDebounced, targetFrequency]);

  // Cleanup on unmount - Enhanced cleanup
  useEffect(() => {
    const rateLimiterInstance = rateLimiter.current;
    return () => {
      isMountedRef.current = false;
      
      // Clear all timeouts
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      if (connectionCheckTimeoutRef.current) {
        clearTimeout(connectionCheckTimeoutRef.current);
      }
      if (processQueueTimeoutRef.current) {
        clearTimeout(processQueueTimeoutRef.current);
      }
      
      // Clear command queue
      commandQueue.current = [];
      rateLimiterInstance.reset();
      
      console.log("TargetDetail unmounted, cleaned up resources");
    };
  }, []);

  // Memoized recording toggle handler
  const handleRecordingToggle = useCallback(() => {
    setIsRecording(prev => {
      const newState = !prev;
      console.log(`Recording ${newState ? "started" : "paused"}`);
      return newState;
    });
  }, []);

  // Memoized status display
  const connectionStatusText = useMemo(() => {
    return isConnected === null ? "Checking..." : isConnected ? "Connected" : "Disconnected";
  }, [isConnected]);

  const signalStatusText = useMemo(() => {
    if (!isConnected || rssi === null) return "N/A";
    if (rssi >= RSSI_EXCELLENT) return "Excellent";
    if (rssi >= RSSI_GOOD) return "Good";
    if (rssi >= RSSI_WEAK) return "Weak";
    return "Poor";
  }, [isConnected, rssi]);

  // Memoized status display with enhanced SDR status
  const sdrStatusText = useMemo(() => {
    if (!sdrConnectionChecked && !isSDRConnected) return "Checking...";
    if (sdrError) return "Error";
    return isSDRConnected ? "Active" : "Disconnected";
  }, [isSDRConnected, sdrError, sdrConnectionChecked]);

  // Check if controls should be enabled
  const controlsEnabled = useMemo(() => {
    return isSDRConnected && !sdrError;
  }, [isSDRConnected, sdrError]);

  // Show SDR connection error alert
  const showSDRConnectionAlert = useCallback(() => {
    Alert.alert(
      "SDR Not Connected",
      "Please check your RTL-SDR connection and try again.",
      [
        { text: "Retry", onPress: () => {
          setSdrError(null);
          setSdrConnectionChecked(false);
          setIsSDRConnected(false);
        }},
        { text: "OK" }
      ]
    );
  }, []);

  if (!parsedTarget) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ImageBackground
        source={require("../../../assets/background/target-tracking-bg.png")}
        style={styles.backgroundImage}
        onError={(error) => console.error("Image load error:", error)}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Feather name="arrow-left" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>{parsedTarget.name}</Text>
          </View>

          {/* Status Indicators */}
          <View style={styles.statusContainer}>
            <View style={styles.statusItem}>
              <View style={styles.statusIconCircle}>
                <View style={styles.statusIconInnerCircle} />
              </View>
              <Text style={styles.statusLabel}>BLE</Text>
              <Text style={[styles.statusValue, { color: isConnected ? 'green' : 'red' }]}>
                {connectionStatusText}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="wifi" size={24} color="white" />
              <Text style={styles.statusLabel}>SIGNAL</Text>
              <Text style={[styles.statusValue, { color: isConnected && rssi !== null ? 'green' : 'orange' }]}>
                {signalStatusText}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="radio" size={24} color="white" />
              <Text style={styles.statusLabel}>SDR</Text>
              <Text style={[styles.statusValue, { color: isSDRConnected ? 'green' : 'red' }]}>
                {sdrStatusText}
              </Text>
            </View>
          </View>

          {/* SDR Error Display - Enhanced */}
          {(sdrError || (!isSDRConnected && sdrConnectionChecked)) && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons name="alert-circle" size={20} color="#FF6464" />
              <Text style={styles.errorText}>
                {sdrError || "SDR device not connected"}
              </Text>
              <TouchableOpacity 
                style={styles.retryButton}
                onPress={showSDRConnectionAlert}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* STR Component and Visualizer - With conditional styling */}
          <View style={styles.signalSection}>
            <View style={[
              styles.strContainer, 
              !controlsEnabled && styles.disabledContainer
            ]}>
              <STRComponent
                initialFrequency={targetFrequency}
                onDataReceived={handleDataReceived}
                contextualStyling={true}
                showControls={controlsEnabled}
                targetPlanet={targetPlanet}
              />
              {!controlsEnabled && (
                <View style={styles.disabledOverlay}>
                  <MaterialCommunityIcons 
                    name="radio-off" 
                    size={48} 
                    color="rgba(255, 255, 255, 0.3)" 
                  />
                  <Text style={styles.disabledText}>SDR Required</Text>
                  <TouchableOpacity 
                    style={styles.connectButton}
                    onPress={showSDRConnectionAlert}
                  >
                    <Text style={styles.connectButtonText}>Connect SDR</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {waveformData.length > 0 && (
              <View style={styles.visualizerWrapper}>
                <AudioVisualizer data={waveformData} />
              </View>
            )}
            {waveformData.length === 0 && !sdrError && (
              <View style={styles.noDataContainer}>
                <Text style={styles.noDataText}>Waiting for SDR data...</Text>
              </View>
            )}
          </View>

          {/* Details Section - Compact layout */}
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>RA:</Text>
              <Text style={styles.detailValue}>{parsedTarget.ra}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DEC:</Text>
              <Text style={styles.detailValue}>{parsedTarget.dec}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ALT:</Text>
              <Text style={styles.detailValue}>{currentAngles.altitude.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>AZ:</Text>
              <Text style={styles.detailValue}>{currentAngles.azimuth.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>FREQ:</Text>
              <Text style={styles.detailValue}>{targetFrequency.toFixed(1)} MHz</Text>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footerButtons}>
            <TouchableOpacity style={styles.iconButton} onPress={stopTracking}>
              <View style={styles.stopIconOuter}>
                <View style={styles.stopIconInner} />
              </View>
              <Text style={styles.iconButtonText}>STOP</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.recButton}
              onPress={handleRecordingToggle}
            >
              <MaterialCommunityIcons
                name={isRecording ? "pause" : "record"}
                size={32}
                color="white"
              />
              <Text style={styles.recButtonText}>
                {isRecording ? "PAUSE" : "REC"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ImageBackground>
    </SafeAreaView>
  );
});

TargetDetail.displayName = 'TargetDetail';

const FONT_FAMILY_UI = "Shantell";

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  backgroundImage: {
    flex: 1,
    resizeMode: "cover",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 50,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  backButton: {
    backgroundColor: "#121212",
    padding: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "white",
  },
  headerTitle: {
    color: "white",
    fontSize: 20,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginLeft: 15,
    lineHeight: 24,
  },
  statusContainer: {
    marginBottom: 2,
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 15,
    paddingVertical: 20,
    paddingHorizontal: 15,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
  },
  statusItem: {
    alignItems: "center",
    flex: 1,
  },
  statusIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#FF8C2B",
    justifyContent: "center",
    alignItems: "center",
  },
  statusIconInnerCircle: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF8C2B",
  },
  statusLabel: {
    color: "white",
    fontFamily: FONT_FAMILY_UI,
    fontSize: 6,
    fontWeight: "400",
    marginTop: 4,
  },
  statusValue: {
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 100, 100, 0.2)",
    borderRadius: 10,
    padding: 10,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#FF6464",
  },
  errorText: {
    color: "#FF6464",
    fontSize: 12,
    fontFamily: FONT_FAMILY_UI,
    marginLeft: 8,
    flex: 1,
  },
  retryButton: {
    backgroundColor: "#FF6464",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginLeft: 8,
  },
  retryButtonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
  },
  signalSection: {
    alignItems: "center",
    marginVertical: 15,
    flex: 1,
    justifyContent: "center",
  },
  strContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  visualizerWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  visualizerContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 80,
    justifyContent: "center",
  },
  visualizerBar: {
    width: 8,
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    borderRadius: 5,
    marginHorizontal: 2,
  },
  detailsContainer: {
    borderRadius: 15,
    padding: 15,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  detailLabel: {
    color: "#FF8C2B",
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    fontSize: 13,
  },
  detailValue: {
    color: "white",
    fontFamily: FONT_FAMILY_UI,
    fontSize: 13,
  },
  footerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 5,
  },
  iconButton: {
    alignItems: "center",
  },
  iconButtonText: {
    color: "white",
    fontSize: 10,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginTop: 5,
  },
  stopIconOuter: {
    width: 35,
    height: 35,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "#FF6464",
    justifyContent: "center",
    alignItems: "center",
  },
  stopIconInner: {
    width: 8,
    height: 8,
    backgroundColor: "#FF6464",
  },
  recButton: {
    backgroundColor: "#FF833A",
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 20,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  recButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginLeft: 6,
  },
  noDataContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  noDataText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    fontFamily: FONT_FAMILY_UI,
    marginTop: 10,
  },
  disabledContainer: {
    opacity: 0.3,
    position: 'relative',
  },
  disabledOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 25,
    zIndex: 10,
  },
  disabledText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: FONT_FAMILY_UI,
    marginTop: 8,
    marginBottom: 12,
  },
  connectButton: {
    backgroundColor: '#FF833A',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  connectButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: FONT_FAMILY_UI,
  },
});

export default TargetDetail;

function handleSDRError(arg0: string) {
  throw new Error("Function not implemented.");
}
