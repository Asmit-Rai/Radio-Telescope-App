import React, { useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  ImageBackground,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  Platform,
  Alert,
} from "react-native";
import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import { useBLE } from "context/BLEContext";


interface Target {
  id: number;
  name: string;
  type: string;
  frequency: string;
  ra: string;
  dec: string;
  info: string;
  azimuth: number;
  altitude: number;
}

// Full targets data from the user's JSON (no changes needed here)
const targetsData: Target[] = [
  {
    id: 5,
    name: "Sagittarius A*",
    type: "Black Hole (Galactic Center)",
    frequency: "2500 – 3000+ MHz",
    ra: "17:45:40",
    dec: "-29°00′",
    info: "Weak narrowband bump near HI line; requires integration and filtering to visualize. Faint but trackable with narrowband focus.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 6,
    name: "Taurus A (Crab Nebula)",
    type: "Pulsar / SNR",
    frequency: "1000 – 5000 MHz",
    ra: "5:34:31",
    dec: "22°01′",
    info: "Distinct tall peak in spectrum analyzer; strong and steady across sessions. Used for calibration and pulse structure modeling.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 7,
    name: "Cygnus A",
    type: "Radio Galaxy",
    frequency: "1000 – 5000 MHz",
    ra: "19:59:28",
    dec: "40°44′",
    info: "Broad, bright emission line; easy to spot as a 'hill' in the FFT. One of the strongest known radio sources.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 8,
    name: "Cassiopeia A",
    type: "Supernova Remnant",
    frequency: "1000 – 3000+ MHz",
    ra: "23:23:24",
    dec: "58°48′",
    info: "Narrowband spectral spike; consistent signal, acts as calibrator. Classic target; bright and stable.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 9,
    name: "3C 273",
    type: "Quasar",
    frequency: "1000 – 5000+ MHz",
    ra: "12:29:06",
    dec: "-05°48′",
    info: "Very clean, narrow peaks; ideal for checking system gain and resolution. Brightest known quasar; used as a beacon or calibrator.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 11,
    name: "PSR B0329+54 Pulsar",
    type: "Pulsar",
    frequency: "400 – 1400 MHz",
    ra: "3:32:59",
    dec: "54°34′",
    info: "Rapid, consistent pulses; high SNR; visible as periodic bands. Bright enough to be a realistic amateur pulsar target.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 12,
    name: "Vela Pulsar",
    type: "Pulsar",
    frequency: "100 – 2000 MHz",
    ra: "8:35:20",
    dec: "-45°10′",
    info: "Tight, frequent pulses; fast flickers in waterfall; subtle but detectable. High signal-to-noise ratio, great for pulse demo.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 13,
    name: "PSR J0437–4715 Pulsar",
    type: "Pulsar",
    frequency: "400 – 2000 MHz",
    ra: "4:37:15",
    dec: "-47°15′",
    info: "Bright, thin spectral lines at precise frequencies (1612/1665/1720 MHz). Millisecond pulsar; one of the brightest in its class.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 22,
    name: "W3(OH)",
    type: "Star-forming Region (Maser)",
    frequency: "1665 – 1667 MHz",
    ra: "2:27:04",
    dec: "61°52′",
    info: "Flat, strong continuum; no distinct features; ideal steady calibration source. Narrowband spikes; used for velocity studies.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 23,
    name: "3C 147",
    type: "Radio Galaxy",
    frequency: "~1000 – 4000 MHz",
    ra: "5:42:36",
    dec: "49°51′07″",
    info: "Sharp maser lines; piercing tones useful for cloud rotation and star formation studies. Strong, steady continuum source.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 24,
    name: "W49A",
    type: "Star-forming Region (Maser)",
    frequency: "1612 – 1720 MHz",
    ra: "19:10:13",
    dec: "09°06′",
    info: "Periodic, ticking pulses; signature of rotating neutron stars. Distinct maser lines; good for rotation studies.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 25,
    name: "PSR B1919+21 Pulsar",
    type: "Pulsar",
    frequency: "400 – 1400 MHz",
    ra: "19:21:44",
    dec: "21°53′",
    info: "Broad diffuse emission; fuzzy shell-like structures in spectral maps. Discrete periodic pulses; original pulsar detected.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 26,
    name: "SNR IC 443",
    type: "Supernova Remnant",
    frequency: "1000 – 3000 MHz",
    ra: "6:17:00",
    dec: "22°21′",
    info: "Low-frequency lobes; extended halo appearance in sky maps; smooth, hissy signal. Diffuse emission with strong shell-like structures.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 27,
    name: "W44",
    type: "Supernova Remnant",
    frequency: "1000 – 3000 MHz",
    ra: "18:56:00",
    dec: "01°21′",
    info: "Bright quasar with jet features; variable broadband bursts with structure. Strong low-frequency radio lobes.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 28,
    name: "PKS 0637-752 Quasar",
    type: "Quasar",
    frequency: "~1000 – 3000+ MHz",
    ra: "6:35:47",
    dec: "-75°16′17″",
    info: "Extended lobes and bright noisy core; complex visual structure with broadband hiss. Bright quasar with jet features.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 29,
    name: "Centaurus A",
    type: "Radio Galaxy",
    frequency: "~1000 – 4000+ MHz",
    ra: "13:25:28",
    dec: "-43°01′09″",
    info: "Variable intensity; bursts that sound like rapid popping or static firecrackers. Extended lobes and bright core, visually noisy.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 30,
    name: "GRS 1915+105 Microquasar (Black Hole)",
    type: "Microquasar (Black Hole)",
    frequency: "~1400 – 2000+ MHz",
    ra: "19:15:12",
    dec: "10°56′44″",
    info: "Bright narrow line emissions; clean tones useful for molecular spectroscopy. Variable; used in studying relativistic jets.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 31,
    name: "Orion KL",
    type: "Star-forming Region",
    frequency: "~1400 – 1800 MHz",
    ra: "5:35:15",
    dec: "-05°22′30″",
    info: "Fast, regular pulses; very strong, ideal for amateur setups and education. Bright line emissions, used in molecular studies.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 32,
    name: "PSR B0950+08 Pulsar",
    type: "Pulsar",
    frequency: "100 – 1500 MHz",
    ra: "9:53:09",
    dec: "07°55′",
    info: "Bright core with diffuse lobes; central peak in signal with extended flanks. Bright pulses visible even in small setups.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 33,
    name: "Fornax A (NGC 1316)",
    type: "Radio Galaxy",
    frequency: "1400 – 3000 MHz",
    ra: "3:22:42",
    dec: "-37°12′30″",
    info: "Variable AGN; flickering or dancing peak in the signal spectrum over time. Bright central core with diffuse lobes.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 34,
    name: "PKS 2155-304 BL Lac Object",
    type: "BL Lac Object",
    frequency: "~1500 – 3000+ MHz",
    ra: "21:58:52",
    dec: "-30°13′32″",
    info: "Extremely stable, flat signal; calibration-grade, like a pure hum. Bright, variable AGN, good for flux monitoring.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 35,
    name: "PKS 1934-638 Radio Galaxy (Calibrator)",
    type: "Radio Galaxy",
    frequency: "1000 – 3000+ MHz",
    ra: "19:39:25",
    dec: "-63°42′45″",
    info: "Diffuse, large-scale emission; faint, fog-like signal with irregular edges. Extremely stable, ideal calibration source.",
    azimuth: 110,
    altitude: 45,
  },
  {
    id: 36,
    name: "Vela SNR",
    type: "Supernova Remnant",
    frequency: "100 – 3000 MHz",
    ra: "8:35:20",
    dec: "-45°10′",
    info: "Diffuse large-scale emission, low frequency. Diffuse, large-scale emission; faint, fog-like signal with irregular edges.",
    azimuth: 110,
    altitude: 45,
  },
];

const TargetTrackingList: React.FC = () => {
  const { connectedDevice, checkConnection } = useBLE();

  useEffect(() => {
    if (connectedDevice) {
      checkConnection(connectedDevice);
    } else {
      Alert.alert(
        "Warning",
        "No device connected. Please connect via Space Connect."
      );
    }
  }, [connectedDevice, checkConnection]);

  const handleTargetPress = (target: Target) => {
    router.push({
      pathname: "/menu/target-tracking-mode",
      params: { target: JSON.stringify(target) },
    });
  };

  // 4. Improved card rendering function for clarity and better layout
  const renderTargetCard = ({
    item,
    index,
  }: {
    item: Target;
    index: number;
  }) => (
    <View style={styles.cardContainer}>
      <TouchableOpacity
        onPress={() => handleTargetPress(item)}
        activeOpacity={0.9}
      >
        {/* <LinearGradient
          colors={gradientColors[index % gradientColors.length]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.cardGradient}
        > */}
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSubtitle}>{item.type}</Text>
          </View>

          <View style={styles.detailsContainer}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Frequency</Text>
              <Text style={styles.detailValue}>{item.frequency}</Text>
            </View>
            <View style={styles.detailRow}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Azimuth / Altitude</Text>
                <Text style={styles.detailValue}>{`${item.azimuth.toFixed(
                  1
                )}° / ${item.altitude.toFixed(1)}°`}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>RA / Dec</Text>
                <Text
                  style={styles.detailValue}
                >{`${item.ra} / ${item.dec}`}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={styles.listenButton}
            onPress={() => handleTargetPress(item)}
          >
            <Text style={styles.listenButtonText}>Listen & Track</Text>
          </TouchableOpacity>
        {/* </LinearGradient> */}
      </TouchableOpacity>
    </View>
  );

  return (
    <ImageBackground
      source={require("../../../assets/background/target-tracking-bg.png")}
      style={styles.background}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <View style={styles.backCircle}>
          <AntDesign name="arrowleft" size={20} color="white" />
        </View>
      </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Target Tracking</Text>
          </View>
        </View>
        <FlatList
          data={targetsData}
          renderItem={renderTargetCard}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContentContainer}
          showsVerticalScrollIndicator={false}
        />
      </SafeAreaView>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    resizeMode: "cover",
  },
  container: {
    flex: 1,
    // 6. Transparent background to show the image
    backgroundColor: "transparent",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 10 : 40,
    paddingBottom: 10,
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
  headerTitleContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
  },
  // 3. Styles updated for single-column layout
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  cardContainer: {
    flex: 1,
    marginVertical: 10,
    borderRadius: 60,
    paddingVertical: 20,
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
  
  cardHeader: {
    marginBottom: 10,
    borderRadius: 100,
    paddingVertical: 15,
    paddingHorizontal: 10,
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
  cardTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "500",
    fontFamily: "Shantell",
    marginBottom: 5,
  },
  cardSubtitle: {
    color: "rgba(255, 255, 255, 0.85)",
    fontSize: 14,
    fontStyle: "italic",
  },
  detailsContainer: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailItem: {
    flex: 1,
    marginBottom: 15,
  },
  detailLabel: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 13,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  detailValue: {
    color: "white",
    fontSize: 15,
    fontWeight: "500",
  },
  listenButton: {
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",

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
  listenButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 16,
  },
});

export default TargetTrackingList;
