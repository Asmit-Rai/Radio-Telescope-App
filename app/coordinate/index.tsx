import { AntDesign } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Platform,
  PermissionsAndroid,
} from "react-native";
import * as Location from "expo-location";
import { useBLE } from "../../context/BLEContext";

const CoordinateInputScreen = () => {
  const router = useRouter();
  const { setUserLocation, getUserLocation } = useBLE();
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [fontsLoaded] = useFonts({
    Shantell: require("../../assets/fonts/Shantell_Sans/static/ShantellSans-Regular.ttf"),
  });

  // Request location permissions on mount
  useEffect(() => {
    const initializePermissions = async () => {
      await requestLocationPermissions();
    };
    initializePermissions();
  }, []);

  // Load saved coordinates on mount
  useEffect(() => {
    const loadSavedCoordinates = async () => {
      const savedLocation = await getUserLocation();
      if (savedLocation && savedLocation !== "Unknown") {
        try {
          const [lat, lon] = savedLocation.split(",");
          setLatitude(lat.trim());
          setLongitude(lon.trim());
        } catch {
          console.warn("Invalid saved coordinates format");
        }
      }
    };
    loadSavedCoordinates();
  }, [getUserLocation]);

  // Request location permissions
  const requestLocationPermissions = async () => {
    try {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "Location Permission",
            message: "This app needs location access to fetch your coordinates.",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } else {
        const { status } = await Location.requestForegroundPermissionsAsync();
        return status === "granted";
      }
    } catch (error) {
      console.error("Error requesting location permissions:", error);
      Alert.alert("Error", "Failed to request location permissions.");
      return false;
    }
  };

  // Validate coordinates
  const validateCoordinates = (lat: string, lon: string) => {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      Alert.alert("Invalid Input", "Latitude must be between -90 and 90.");
      return false;
    }
    if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
      Alert.alert("Invalid Input", "Longitude must be between -180 and 180.");
      return false;
    }
    return true;
  };

  // Save coordinates to AsyncStorage and navigate
  const handleArrowPress = async () => {
    if (!latitude || !longitude) {
      Alert.alert("Input Required", "Please enter both latitude and longitude or fetch your location.");
      return;
    }
    if (!validateCoordinates(latitude, longitude)) return;
    setIsLoading(true);
    try {
      await setUserLocation(`${latitude},${longitude}`);
      router.push("dashboard" as any);
    } catch (error) {
      console.error("Error saving coordinates:", error);
      Alert.alert("Error", "Failed to save coordinates.");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch current location (offline if possible)
  const handleFetchLocation = async () => {
    setIsLoading(true);
    try {
      const hasPermission = await requestLocationPermissions();
      if (!hasPermission) {
        Alert.alert("Permission Denied", "Location access is required to fetch coordinates. Please enable location services in your device settings.");
        return;
      }

      // First try last known location (cached, works offline)
      let location = await Location.getLastKnownPositionAsync({
        maxAge: 3600000, // Accept locations up to 1 hour old
      });

      // Fallback to current position if no cached location
      if (!location) {
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000, // Wait up to 5 seconds
          });
        } catch (error) {
          console.warn("No current location available:", error);
        }
      }

      if (location) {
        const { latitude: lat, longitude: lon } = location.coords;
        setLatitude(lat.toFixed(6).toString());
        setLongitude(lon.toFixed(6).toString());
        await setUserLocation(`${lat.toFixed(6)},${lon.toFixed(6)}`);
        Alert.alert("Success", "Location fetched and saved successfully!");
      } else {
        Alert.alert(
          "Location Unavailable",
          "Unable to fetch location. Please ensure location services are enabled and try again, or enter coordinates manually."
        );
      }
    } catch (error) {
      console.error("Error fetching location:", error);
      Alert.alert(
        "Error",
        "Failed to fetch location. Ensure location services are enabled and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <View style={styles.backCircle}>
          <AntDesign name="arrowleft" size={20} color="white" />
        </View>
      </TouchableOpacity>

      <View style={styles.container}>
        <Text style={styles.title}>Enter your{"\n"}cosmic{"\n"}coordinates..</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Latitude</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              value={latitude}
              onChangeText={setLatitude}
              keyboardType="numeric"
              placeholder="Enter latitude"
              placeholderTextColor="#aaa"
            />
            <TouchableOpacity onPress={() => setLatitude("")}>
              <AntDesign name="closecircleo" size={18} color="white" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 16 }]}>Longitude</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.input}
              value={longitude}
              onChangeText={setLongitude}
              keyboardType="numeric"
              placeholder="Enter longitude"
              placeholderTextColor="#aaa"
            />
            <TouchableOpacity onPress={() => setLongitude("")}>
              <AntDesign name="closecircleo" size={18} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.rowButtonContainer}>
  <TouchableOpacity
    style={[styles.fetchButton, isLoading && styles.disabledButton]}
    onPress={handleFetchLocation}
    disabled={isLoading}
  >
    <Text style={styles.buttonText}>Fetch Location</Text>
  </TouchableOpacity>

  <TouchableOpacity
    style={[styles.nextButton, isLoading && styles.disabledButton]}
    onPress={handleArrowPress}
    disabled={isLoading}
  >
    <AntDesign name="arrowright" size={28} color="black" />
  </TouchableOpacity>
</View>

      </View>

      <Image
        source={require("../../assets/background/moon-bottom-img.png")}
        style={styles.moonImage}
        resizeMode="contain"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "black",
  },
  container: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 24,
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 10,
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
  title: {
    fontFamily: "Shantell",
    fontSize: 32,
    color: "white",
    lineHeight: 44,
    marginBottom: 40,
  },
  inputContainer: {
    marginBottom: 40,
  },
  label: {
    color: "#FF833A",
    fontFamily: "Shantell",
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#FF833A",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "space-between",
    alignItems: "center",
  },
  input: {
    color: "white",
    fontSize: 16,
    flex: 1,
    fontFamily: "Shantell",
  },
  buttonContainer: {
    flexDirection: "column",
    gap: 16,
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: "#FF833A",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: "black",
    fontFamily: "Shantell",
    fontSize: 16,
  },

  moonImage: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    zIndex: -1,
  },

  rowButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  
  fetchButton: {
    backgroundColor: "#FF833A",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flex: 1.5, 
  },
  
  nextButton: {
    backgroundColor: "#FF833A",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  
});


export default CoordinateInputScreen;