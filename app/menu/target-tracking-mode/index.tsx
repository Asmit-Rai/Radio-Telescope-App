import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { useBLE } from "context/BLEContext";
import * as Astronomy from "astronomy-engine";
import RTLSDRComponent from "components/RTLSDRComponent";

// Observer coordinates
const OBSERVER_LATITUDE = 28.6139; // Delhi
const OBSERVER_LONGITUDE = 77.209;
const OBSERVER_HEIGHT = 216; // meters

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

// --- Helper Components ---
const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ data }) => {
  return (
    <View style={styles.visualizerContainer}>
      {data.map((height, index) => (
        <View key={index} style={[styles.visualizerBar, { height: height * 100 + 10 }]} />
      ))}
    </View>
  );
};

// --- Main Component ---
const TargetDetail: React.FC = () => {
  const { target } = useLocalSearchParams<{ target: string }>();
  const { connectedDevice, writeData, checkConnection } = useBLE();
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isTracking, setIsTracking] = useState<boolean>(true);
  const [hasSentAngles, setHasSentAngles] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [azimuth, setAzimuth] = useState<number>(0);
  const [altitude, setAltitude] = useState<number>(0);
  const [frequency, setFrequency] = useState<number>(0);
  const [waveformData, setWaveformData] = useState<number[]>(new Array(14).fill(0));
  const isMountedRef = useRef<boolean>(true);
  const lastAnglesRef = useRef<{ alt: number; az: number } | null>(null);

  // Parse target once
  const parsedTarget = useRef<Target | null>(null);
  useEffect(() => {
    try {
      parsedTarget.current = target ? JSON.parse(target) : null;
      if (!parsedTarget.current) {
        Alert.alert("Error", "No target selected", [
          { text: "OK", onPress: () => router.back() },
        ]);
        console.log("No target selected");
      }
    } catch (error) {
      console.error("Error parsing target:", error);
      Alert.alert("Error", "Invalid target data", [
        { text: "OK", onPress: () => router.back() },
      ]);
    }
  }, [target]);

  // --- Convert RA/Dec to Alt/Az ---
  const convertToAltAz = useCallback((target: Target) => {
    const { name, ra, dec } = target;
    const date = new Date();
    const observer = new Astronomy.Observer(
      OBSERVER_LATITUDE,
      OBSERVER_LONGITUDE,
      OBSERVER_HEIGHT
    );

    try {
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

      if (
        ["Varies", "Dynamic", "Local", "Sweep"].includes(ra) ||
        ["Varies", "Dynamic", "Local", "Sweep"].includes(dec)
      ) {
        console.log(`Dynamic coordinates for ${name}, using default position`);
        return { azimuth: 90, altitude: 90 }; // Default to zenith
      }

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
  }, []);

  // --- Send BLE Angles ---
  const sendAngles = useCallback(
    async (alt: number, az: number) => {
      if (!connectedDevice || !writeData || !isMountedRef.current || !isTracking) {
        console.log("BLE not ready or tracking stopped");
        return;
      }

      const constrainedAlt = Math.max(0, Math.min(180, Math.round(alt)));
      const constrainedAz = Math.max(0, Math.min(360, Math.round(az)));

      // Skip if angles haven't changed
      if (
        lastAnglesRef.current &&
        lastAnglesRef.current.alt === constrainedAlt &&
        lastAnglesRef.current.az === constrainedAz
      ) {
        console.log("Angles unchanged, skipping write");
        return;
      }

      try {
        const success = await writeData(constrainedAlt, constrainedAz);
        if (!success) {
          throw new Error("Write failed");
        }
        if (isMountedRef.current) {
          setAltitude(constrainedAlt);
          setAzimuth(constrainedAz);
          lastAnglesRef.current = { alt: constrainedAlt, az: constrainedAz };
          console.log(`Sent angles: Alt=${constrainedAlt}, Az=${constrainedAz}`);
        }
      } catch (error) {
        console.error("BLE error:", error);
        Alert.alert("Error", "Failed to send angles");
        if (isMountedRef.current) {
          setIsConnected(false);
        }
      }
    },
    [connectedDevice, writeData, isTracking]
  );

  // --- Handle SDR Data ---
  const handleDataReceived = useCallback((samples: number[]) => {
    const newData = new Array(14).fill(0).map((_, i) => {
      const index = Math.floor((i / 14) * (samples.length / 2)) * 2;
      const iSample = samples[index] || 0;
      const qSample = samples[index + 1] || 0;
      return Math.sqrt(iSample * iSample + qSample * qSample) / 255;
    });
    if (isMountedRef.current) {
      setWaveformData(newData);
      console.log("Received SDR data, updated waveform");
    }
  }, []);

  // --- Stop Tracking ---
  const stopTracking = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsTracking(false);
    setIsRecording(false);
    await sendAngles(90, 90);
    console.log("Tracking stopped");
  }, [sendAngles]);

  // --- Connection Monitoring ---
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkStatus = async () => {
      if (!isMountedRef.current || !connectedDevice) {
        if (isMountedRef.current) {
          setIsConnected(false);
        }
        return;
      }

      try {
        const connection = await checkConnection(connectedDevice);
        if (isMountedRef.current) {
          setIsConnected(connection);
          console.log(`Connection check: connected=${connection}`);
        }
      } catch (error) {
        console.error("Connection check error:", error);
        if (isMountedRef.current) {
          setIsConnected(false);
        }
      }
    };

    checkStatus();
    interval = setInterval(checkStatus, 30000);

    return () => {
      clearInterval(interval);
      console.log("Connection check interval cleared");
    };
  }, [connectedDevice, checkConnection]);

  // --- Initialization ---
  useEffect(() => {
    isMountedRef.current = true;

    if (!parsedTarget.current || hasSentAngles) {
      return;
    }

    if (!connectedDevice) {
      Alert.alert("Error", "No BLE device connected", [
        { text: "OK", onPress: () => router.replace("/") },
      ]);
      console.log("No BLE device connected");
      return;
    }

    const initialize = async () => {
      if (!isMountedRef.current || !isTracking) return;

      // Parse frequency
      const freqMatch = parsedTarget.current?.frequency
        ? parsedTarget.current.frequency.match(/(\d+\.?\d*)/)
        : null;
      const freq = freqMatch ? parseFloat(freqMatch[0]) : 20;
      if (isMountedRef.current) {
        setFrequency(freq);
        console.log(`Frequency set to ${freq} MHz`);
      }

      // Convert coordinates and send angles
      const { azimuth: az, altitude: alt } = convertToAltAz(parsedTarget.current!);
      await sendAngles(alt, az);
      if (isMountedRef.current) {
        setHasSentAngles(true);
      }
    };

    initialize().catch((error) => console.error("Initialization error:", error));

    return () => {
      isMountedRef.current = false;
      console.log("TargetDetail unmounted, cleaned up resources");
    };
  }, [parsedTarget.current, connectedDevice, convertToAltAz, sendAngles]);

  if (!parsedTarget.current) return null;

  // --- JSX ---
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
            <Text style={styles.headerTitle}>{parsedTarget.current.name}</Text>
          </View>

          {/* Status Indicators */}
          <View style={styles.statusContainer}>
            <View style={styles.statusItem}>
              <View style={styles.statusIconCircle}>
                <View style={styles.statusIconInnerCircle} />
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
              <MaterialCommunityIcons name="wifi" size={24} color="white" />
              <Text style={styles.statusLabel}>SIGNAL</Text>
              <Text style={styles.statusValueGreen}>
                {isConnected ? "Excellent" : "N/A"}
              </Text>
            </View>
            <View style={styles.statusItem}>
              <MaterialCommunityIcons name="battery" size={24} color="#34C759" />
              <Text style={styles.statusLabel}>BATTERY</Text>
              <Text style={styles.statusValueGreen}>100%</Text>
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
              <Text style={styles.detailValue}>{parsedTarget.current.ra}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>DECLINATION (DEC):</Text>
              <Text style={styles.detailValue}>{parsedTarget.current.dec}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>ALTITUDE (Alt):</Text>
              <Text style={styles.detailValue}>{altitude.toFixed(1)}°</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>AZIMUTH (Az):</Text>
              <Text style={styles.detailValue}>{azimuth.toFixed(1)}°</Text>
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
              onPress={() => {
                setIsRecording(!isRecording);
                console.log(`Recording ${isRecording ? "paused" : "started"}`);
              }}
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
};

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
    color: "#34C759",
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