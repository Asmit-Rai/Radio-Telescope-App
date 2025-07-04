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
import RTLSDRComponent from "../../../components/RTLSDRComponent";

// Rate limiting constants
const MAX_COMMANDS_PER_SECOND = 10;
const COMMAND_DEBOUNCE_DELAY = 300;
const CONNECTION_CHECK_INTERVAL = 30000;

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

// --- Rate Limiter Class ---
class CommandRateLimiter {
  private commandTimes: number[] = [];
  private readonly maxCommandsPerSecond: number;

  constructor(maxCommandsPerSecond: number = MAX_COMMANDS_PER_SECOND) {
    this.maxCommandsPerSecond = maxCommandsPerSecond;
  }

  canExecuteCommand(): boolean {
    const now = Date.now();
    // Remove commands older than 1 second
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
  const [waveformData, setWaveformData] = useState<number[]>(() => new Array(14).fill(0));
  const [rssi, setRssi] = useState<number | null>(null);
  
  // Refs for values that don't need to trigger re-renders
  const isMountedRef = useRef<boolean>(true);
  const lastAnglesRef = useRef<{ alt: number; az: number } | null>(null);
  const commandQueue = useRef<CommandQueueItem[]>([]);
  const isProcessingCommand = useRef<boolean>(false);
  const rateLimiter = useRef<CommandRateLimiter>(new CommandRateLimiter());
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse target once with memoization
  const parsedTarget = useMemo<Target | null>(() => {
    try {
      return target ? JSON.parse(target) : null;
    } catch (error) {
      console.error("Error parsing target:", error);
      return null;
    }
  }, [target]);

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

  // Process command queue with rate limiting
  const processCommandQueue = useCallback(async () => {
    if (
      isProcessingCommand.current || 
      commandQueue.current.length === 0 ||
      !rateLimiter.current.canExecuteCommand()
    ) {
      // If rate limited, try again after a short delay
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
        setTimeout(processCommandQueue, 50);
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

  // Handle SDR data with memoization
  const handleDataReceived = useCallback((samples: number[]) => {
    const newData = new Array(14).fill(0).map((_, i) => {
      const index = Math.floor((i / 14) * (samples.length / 2)) * 2;
      const iSample = samples[index] || 0;
      const qSample = samples[index + 1] || 0;
      return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
    });

    if (isMountedRef.current) {
      setWaveformData(prevData => {
        // Only update if data has actually changed
        const hasChanged = newData.some((val, idx) => Math.abs(val - prevData[idx]) > 0.01);
        return hasChanged ? newData : prevData;
      });
    }
  }, []);

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

  // Initialization with proper dependency management
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
        // Parse frequency
        const freqMatch = parsedTarget.frequency?.match(/(\d+\.?\d*)/);
        const freq = freqMatch ? parseFloat(freqMatch[0]) : 20;
        
        setFrequency(prevFreq => prevFreq !== freq ? freq : prevFreq);

        // Convert coordinates and send angles
        const { azimuth: az, altitude: alt } = await convertToAltAz(parsedTarget);
        await sendAnglesDebounced(alt, az, 0); // High priority for initial positioning
        
        setHasSentAngles(true);
        console.log(`Initialized: Frequency=${freq}MHz, Alt=${alt}°, Az=${az}°`);
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();
  }, [parsedTarget, connectedDevice, isTracking, hasSentAngles, convertToAltAz, sendAnglesDebounced]);

  // Cleanup on unmount
  useEffect(() => {
    // Capture the current rateLimiter instance for cleanup
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

  const daisyChainStatusText = useMemo(() => {
    return isConnected ? "Active" : "Inactive";
  }, [isConnected]);

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
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={styles.statusValueGreen}>
                {connectionStatusText}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="wifi" size={24} color="white" />
              <Text style={styles.statusLabel}>SIGNAL</Text>
              <Text style={styles.statusValueGreen}>
                {signalStatusText}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="access-point-network" size={24} color="white" />
              <Text style={styles.statusLabel}>DAISY CHAIN</Text>
              <Text style={styles.statusValueGreen}>
                {daisyChainStatusText}
              </Text>
            </View>
          </View>

          {/* Visualizer */}
          <View style={styles.planetContainer}>
            <RTLSDRComponent
              frequency={frequency}
              onDataReceived={handleDataReceived}
            />
            <AudioVisualizer data={waveformData} />
          </View>

          {/* Details Section */}
          <View style={styles.detailsContainer}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>RIGHT ASCENSION (RA):</Text>
              <Text style={styles.detailValue}>{parsedTarget.ra}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DECLINATION (DEC):</Text>
              <Text style={styles.detailValue}>{parsedTarget.dec}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ALTITUDE (Alt):</Text>
              <Text style={styles.detailValue}>{currentAngles.altitude.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>AZIMUTH (Az):</Text>
              <Text style={styles.detailValue}>{currentAngles.azimuth.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>FREQUENCY:</Text>
              <Text style={styles.detailValue}>{frequency} MHz</Text>
            </View>
          </View>

          <View style={{ flex: 1 }} />

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
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
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
    fontSize: 22,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginLeft: 15,
    lineHeight: 26,
  },
  statusContainer: {
    marginTop: 20,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    alignItems: "center",
  },
  statusItem: {
    alignItems: "center",
  },
  statusIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FF8C2B",
    justifyContent: "center",
    alignItems: "center",
  },
  statusIconInnerCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#FF8C2B",
  },
  statusLabel: {
    color: "white",
    fontFamily: FONT_FAMILY_UI,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 5,
  },
  statusValueGreen: {
    color: 'green',
    fontSize: 12,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginTop: 2,
  },
  planetContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 15,
  },
  visualizerContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    height: 150,
  },
  visualizerBar: {
    width: 10,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
    borderRadius: 10,
    marginHorizontal: 3,
  },
  detailsContainer: {
    marginTop: 40,
    borderRadius: 20,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    width: "100%",
  },
  detailLabel: {
    color: "#FF8C2B",
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    fontSize: 15,
  },
  detailValue: {
    color: "white",
    fontFamily: FONT_FAMILY_UI,
    fontSize: 15,
  },
  footerButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    position: "relative",
    paddingBottom: 55,
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
    width: 40,
    height: 40,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: "#FF6464",
    justifyContent: "center",
    alignItems: "center",
  },
  stopIconInner: {
    width: 10,
    height: 10,
    backgroundColor: "#FF6464",
  },
  recButton: {
    backgroundColor: "#FF833A",
    borderRadius: 30,
    paddingVertical: 15,
    paddingHorizontal: 25,
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
    fontSize: 16,
    fontWeight: "bold",
    fontFamily: FONT_FAMILY_UI,
    marginLeft: 8,
  },
});

export default TargetDetail;