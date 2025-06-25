import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  View
} from "react-native";

const LoadingScreen = () => {
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    Shantell: require("../../assets/fonts/Shantell_Sans/static/ShantellSans-Regular.ttf"),
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      router.push("/connected" as any);
    }, 3000);
    return () => clearTimeout(timer); 
  }, []);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Image
          source={require("../../assets/background/stars.png")}
          style={styles.planetImage}
          resizeMode="cover"
        />
        <Text style={styles.title}>
          Listening{"\n"}to{"\n"}cosmic{"\n"}secrets...
        </Text>

        <View style={styles.loadingRow}>
          <ActivityIndicator size="large" color="#FF833A" />
          <Text style={styles.loadingText}> Just a moment!... </Text>
        </View>
      </View>

      <Image
        source={require("../../assets/background/earth-bottom-img.png")}
        style={styles.earthImage}
        resizeMode="cover"
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "black",
    justifyContent: "space-between",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingLeft: 30,
  },
  title: {
    fontFamily: "Shantell",
    fontSize: 38,
    color: "white",
    lineHeight: 50,
    textAlign: "left",
    marginBottom: 50,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  loadingText: {
    fontFamily: "Shantell",
    fontSize: 20,
    color: "#FF833A",
    marginLeft: 10,
  },
  earthImage: {
    width: "100%",
    height: 180,
    position: "absolute",
    bottom: 0,
  },
  planetImage: {
    position: "absolute",
    bottom: 0,
    width: "100%",
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
    alignItems: "center",
    justifyContent: "center",
  },
});

export default LoadingScreen;
