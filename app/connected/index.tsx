import { AntDesign, FontAwesome5 } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const ConnectedScreen = () => {
  const router = useRouter();
  const [deviceName, setDeviceName] = useState("");

  const [fontsLoaded] = useFonts({
    Shantell: require("../../assets/fonts/Shantell_Sans/static/ShantellSans-Regular.ttf"),
  });

  useEffect(() => {
    const getDeviceName = async () => {
      try {
        const name = await AsyncStorage.getItem('connected_device_name');
        if (name) {
          setDeviceName(name);
        }
      } catch (error) {
        console.error("Error retrieving device name:", error);
      }
    };

    getDeviceName();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <View style={styles.backCircle}>
          <AntDesign name="arrowleft" size={20} color="white" />
        </View>
      </TouchableOpacity>

      <View style={styles.container}>
        <View style={styles.statusRow}>
          <FontAwesome5 name="wifi" size={20} color="limegreen" />
          <Text style={styles.connectedText}>Connected</Text>
        </View>

        <Text style={styles.deviceName}>{deviceName}</Text>
        <View style={styles.imageContainer}>
          <Image
            source={require("../../assets/background/connect4.png")}
            style={styles.dishImage}
            resizeMode="contain"
          />
        </View>
        <TouchableOpacity
          style={styles.nextButton}
          onPress={() => router.push("coordinate" as any)}
        >
          <AntDesign name="arrowright" size={28} color="black" />
        </TouchableOpacity>
      </View>
    
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
    alignItems: "center",
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
  planetImage: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    height: 350,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  connectedText: {
    fontFamily: "Shantell",
    color: "limegreen",
    fontSize: 20,
  },
  deviceName: {
    fontFamily: "Shantell",
    fontSize: 22,
    color: "white",
    marginTop: 10,
    marginBottom: 30,
  },
  imageContainer: {
    width: 300,
    height: 400,
    marginBottom: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dishImage: {
    width: 300,
    height: 400,
  },
  nextButton: {
    backgroundColor: "limegreen",
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default ConnectedScreen;