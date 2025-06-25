import { AntDesign, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Switch,
  ImageBackground,
  Image,
  ScrollView,
  TextInput,
} from "react-native";
// Assuming context is in a directory at the root level
import { useBLE } from "../../../context/BLEContext"; 

const starBackground = require("../../../assets/background/star-background.png");
const planetImage = require("../../../assets/background/purple-planet.png");

type SettingsRowProps = {
  label: string;
  icon: React.ReactNode;
  onPress?: () => void;
};

const SettingsRow: React.FC<SettingsRowProps> = ({ label, icon, onPress }) => (
  <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress}>
    <Text style={styles.rowLabel}>{label}</Text>
    {icon}
  </TouchableOpacity>
);

// --- Main Settings Screen Component ---
const SettingsScreen = () => {
  const [isPowerSavingEnabled, setIsPowerSavingEnabled] = useState(true);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  // Get the location functions from your global context
  const { getUserLocation, setUserLocation } = useBLE();

  // --- NEW: Effect to LOAD coordinates from storage when the screen opens ---
  useEffect(() => {
    const loadSavedCoordinates = async () => {
      const savedLocation = await getUserLocation();
      if (savedLocation && savedLocation !== "Unknown") {
        try {
          const [lat, lon] = savedLocation.split(",");
          setLatitude(lat.trim());
          setLongitude(lon.trim());
        } catch (error) {
          console.warn("Could not parse saved coordinates in settings:", error);
        }
      }
    };
    loadSavedCoordinates();
  }, [getUserLocation]);

  // --- NEW: Effect to SAVE coordinates automatically when the user changes them ---
  useEffect(() => {
    // Debounce to prevent saving on every single keystroke
    const handler = setTimeout(() => {
      // Only save if both fields have a value to avoid storing incomplete data
      if (latitude && longitude) {
        setUserLocation(`${latitude},${longitude}`);
      }
    }, 800); // Wait 800ms after user stops typing before saving

    // Cleanup function to clear the timeout if the user types again
    return () => {
      clearTimeout(handler);
    };
  }, [latitude, longitude, setUserLocation]); // Re-run this effect if any of these change

  return (
    <ImageBackground source={starBackground} style={styles.background}>
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
        </View>
        <View style={styles.slide}>
          <View style={styles.glassContainer}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              <Text style={styles.sectionTitle}>Device Settings</Text>

              <SettingsRow
                label="Language"
                icon={
                  <Ionicons name="chevron-forward" size={22} color="white" />
                }
                onPress={() => console.log("Language Pressed")}
              />
              <SettingsRow
                label="Motor Status"
                icon={
                  <Ionicons name="chevron-forward" size={22} color="white" />
                }
                onPress={() => console.log("Motor Status Pressed")}
              />
              <SettingsRow
                label="Power Saving Mode"
                icon={
                  <Switch
                    trackColor={{ false: "#767577", true: "#FF833A" }}
                    thumbColor={isPowerSavingEnabled ? "#f4f3f4" : "#f4f3f4"}
                    ios_backgroundColor="#3e3e3e"
                    onValueChange={() =>
                      setIsPowerSavingEnabled((previousState) => !previousState)
                    }
                    value={isPowerSavingEnabled}
                  />
                }
              />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Latitude</Text>
                <TextInput
                  style={styles.input}
                  value={latitude}
                  onChangeText={setLatitude}
                  placeholderTextColor="#555"
                  keyboardAppearance="dark"
                  keyboardType="numeric" // Recommended for coordinate input
                />
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Longitude</Text>
                <TextInput
                  style={styles.input}
                  value={longitude}
                  onChangeText={setLongitude}
                  placeholderTextColor="#555"
                  keyboardAppearance="dark"
                  keyboardType="numeric" // Recommended for coordinate input
                />
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 30 }]}>More</Text>
              <SettingsRow
                label="About us"
                icon={
                  <Ionicons name="chevron-forward" size={22} color="white" />
                }
                onPress={() => router.push("/menu/about-us")}
              />
            </ScrollView>
          </View>
        </View>
      </SafeAreaView>

      <Image
        source={planetImage}
        style={styles.bottomImage}
        resizeMode="cover"
      />
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: "#121212",
    zIndex: -1,
  },
  container: {
    flex: 1,
    zIndex: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: 30,
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
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
  scrollContent: {
    paddingHorizontal: 25,
    paddingTop: 10,
  },
  sectionTitle: {
    color: "#FF833A",
    fontSize: 20,
    marginTop: 25,
    marginBottom: 15,
    fontFamily: "Shantell",
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
  },
  rowLabel: {
    color: "white",
    fontSize: 18,
    fontFamily: "Shantell",
  },
  input: {
    color: "#FF833A",
    fontSize: 18,
    width: "50%",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.5)",
    textAlign: "right",
    paddingBottom: 4,
  },
  bottomImage: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    width: "100%",
    height: "100%",
    zIndex: 0,
  },
  slide: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  glassContainer: {
    width: "90%",
    height: "90%",
    borderRadius: 60,
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
    overflow: "hidden",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

export default SettingsScreen;