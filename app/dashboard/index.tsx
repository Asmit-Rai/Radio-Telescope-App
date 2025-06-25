import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  ImageSourcePropType,
  BackHandler,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native"; // ensures back handler only works here
import { useRouter } from "expo-router";
import CardTile from "../../components/CardTile";
import Exit from "../../components/Exit"; // Confirm this exists and doesn't crash if 'visible' is false
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useBLE } from "context/BLEContext";

const feeIcon: ImageSourcePropType = require("../../assets/icons/free.png");
const targetIcon: ImageSourcePropType = require("../../assets/icons/target.png");
const signalsIcon: ImageSourcePropType = require("../../assets/icons/signals.png");
const learningIcon: ImageSourcePropType = require("../../assets/icons/learning.png");
const helpIcon: ImageSourcePropType = require("../../assets/icons/help.png");
const settingsIcon: ImageSourcePropType = require("../../assets/icons/settings.png");

export default function Dashboard() {
  const router = useRouter();
  const [showConfirmExit, setShowConfirmExit] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [signalStrength, setSignalStrength] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const { connectedDevice, checkConnection, getRSSI } = useBLE();

  // Ensures back handler runs only when screen is focused

  useEffect(() => {
    const checkStatusAndSignal = async () => {
      const connection = await checkConnection(connectedDevice);
      setIsConnected(connection);

      if (connection) {
        const rssi = await getRSSI();
        setSignalStrength(rssi);
      } else {
        setSignalStrength(null);
      }
    };

    checkStatusAndSignal(); // initial

    const interval = setInterval(checkStatusAndSignal, 10000); // every 10s
    return () => clearInterval(interval);
  }, [connectedDevice]);

  useEffect(() => {
    const getDeviceName = async () => {
      try {
        const name = await AsyncStorage.getItem("connected_device_name");
        if (name) {
          setDeviceName(name);
        }
      } catch (error) {
        console.error("Error retrieving device name:", error);
      }
    };

    getDeviceName();
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      const onBackPress = () => {
        setShowConfirmExit(true);
        return true;
      };

      let subscription: any;

      if (Platform.OS === "android") {
        subscription = BackHandler.addEventListener(
          "hardwareBackPress",
          onBackPress
        );
      }

      return () => {
        if (Platform.OS === "android" && subscription?.remove) {
          subscription.remove();
        }
      };
    }, [])
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Fixed Header */}
      <View style={styles.headerContainer}>
        <Text style={styles.title}>{deviceName}</Text>
        <View style={styles.statusRow}>
          {/* <Status label="STATUS" value="Connected" /> */}
          {/* <Status label="SIGNAL" value="Excellent" /> */}
          <Status
            label="STATUS"
            value={
              isConnected === null
                ? "Checking..."
                : isConnected
                ? "Connected"
                : "Disconnected"
            }
          />
          <Status
            label="SIGNAL"
            value={
              signalStrength !== null ? `${signalStrength} dBm` : "Unknown"
            }
          />
          <Status label="BATTERY" value="100%" />
        </View>
      </View>

      {/* Scrollable Grid */}
      <ScrollView
        contentContainerStyle={styles.gridContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          <CardTile
            title="Free Use Mode"
            icon={feeIcon}
            color="#d9b3f5"
            onPress={() => router.push("/menu/free-use-mode" as any)}
          />
          <CardTile
            title="Target Tracking"
            icon={targetIcon}
            color="#d3ecfb"
            onPress={() => router.push("/menu/target-tracking-list" as any)}
          />
          <CardTile
            title="Saved Signals"
            icon={signalsIcon}
            color="#e0d4fb"
            onPress={() => router.push("/menu/saved-signal-list" as any)}
          />
          <CardTile
            title="Learning Center"
            icon={learningIcon}
            color="#fcdede"
            onPress={() => router.push("/menu/learning-center" as any)}
          />
          <CardTile
            title="Help"
            icon={helpIcon}
            color="#fdf2a9"
            onPress={() => router.push("/menu/about-us" as any)}
          />
          <CardTile
            title="Settings"
            icon={settingsIcon}
            color="#d4fbe0"
            onPress={() => router.push("/menu/settings" as any)}
          />
        </View>
      </ScrollView>

      {/* Exit confirmation modal */}
      {showConfirmExit && (
        <Exit
          visible={showConfirmExit}
          onConfirm={() => {
            setShowConfirmExit(false);
            BackHandler.exitApp();
          }}
          onCancel={() => setShowConfirmExit(false)}
        />
      )}
    </SafeAreaView>
  );
}

function Status({ label, value }: any) {
  return (
    <View style={styles.statusItem}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.valueGreen}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0e0e17",
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: "#0e0e17",
    zIndex: 10,
  },
  title: {
    fontSize: 24,
    color: "white",
    marginBottom: 12,
    textAlign: "center",
    textTransform: "uppercase",
    fontFamily: "Shantell",
  },
  statusRow: {
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
  label: {
    color: "#fff",
    fontSize: 12,
    fontFamily: "Shantell",
  },
  valueGreen: {
    color: "#00FF7F",
    fontFamily: "Shantell",
  },
  gridContainer: {
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 24,
    flexGrow: 1,
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    paddingTop: 10,
    
  },
});
