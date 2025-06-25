import { AntDesign } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  ImageBackground,
} from "react-native";


const slides = [
  {
    key: "1",
    title: "Let's\nGet Started!",
    description: "Explore space signals, track planets, and learn with us!",
    image: require("../../../assets/images/about-us/1.png"),
    buttonText: "Start",
  },
  {
    key: "2",
    title: "Welcome\nto\nRadio Telescope-X",
    description: "Explore space signals, track planets, and learn with us!",
    image: require("../../../assets/images/about-us/2.png"),
  },
  {
    key: "3",
    title: "Track & Record",
    description:
      "Follow planets like Jupiter and listen to real space signals.",
    image: require("../../../assets/images/about-us/3.png"),
  },
  {
    key: "4",
    title: "Complete\nMissions",
    description: "Complete missions and get exciting gifts!!",
    image: require("../../../assets/images/about-us/4.png"),
  },
  {
    key: "5",
    title: "Learning\nModule",
    description: "Learn with quick short modules. Build your knowledge.",
    image: require("../../../assets/images/about-us/5.png"),
  },
];

const { width: screenWidth } = Dimensions.get("window");

export default function AboutUsScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollViewRef = useRef<ScrollView | null>(null);

  const handleNext = () => {
    const nextIndex = activeIndex + 1;
    if (nextIndex < slides.length) {
      setActiveIndex(nextIndex);
      scrollViewRef.current?.scrollTo({
        x: nextIndex * screenWidth,
        animated: false,
      });
    } else {
      router.back();
    }
  };

  const onScroll = (event: any) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / screenWidth);
    if (index !== activeIndex) {
      setActiveIndex(index);
    }
  };

  const renderPagination = () => (
    <View style={styles.paginationContainer}>
      {slides.map((_, index) => (
        <View
          key={index}
          style={[styles.dot, activeIndex === index ? styles.activeDot : {}]}
        />
      ))}
    </View>
  );

  return (
    <ImageBackground
      source={require("../../../assets/images/about-us/background-image.png")}
      style={styles.backgroundImage}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <View style={styles.backCircle}>
            <AntDesign name="arrowleft" size={20} color="white" />
          </View>
        </TouchableOpacity>

        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={styles.scrollView}
        >
          {slides.map((slide, index) => (
            <View key={slide.key} style={styles.slide}>
              <View style={styles.glassContainer}>
                <View style={styles.topSection}>
                  <Text style={styles.title}>{slide.title}</Text>
                  <Image
                    source={slide.image}
                    style={styles.image}
                    resizeMode="contain"
                  />
                  {!!slide.description && (
                    <Text style={styles.description}>{slide.description}</Text>
                  )}
                </View>

                <View style={styles.bottomSection}>
                  {renderPagination()}
                  <TouchableOpacity
                    onPress={handleNext}
                    style={styles.nextButton}
                  >
                    <View style={styles.nextButtonContent}>
                      <Text style={styles.nextButtonText}>
                        {slide.buttonText || "Next"}
                      </Text>
                      <Text style={styles.nextButtonArrow}>→</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  slide: {
    width: screenWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  glassContainer: {
    
    width: "90%",
    height: "80%",
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
  topSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottomSection: {
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    position: "absolute",
    top: 40,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "white",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    color: "#FF9A55",
    textAlign: "center",
    lineHeight: 42,
    marginBottom: 20,
    fontFamily: "Shantell",
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  image: {
    width: 220,
    height: 180,
    marginBottom: 20,
    resizeMode: "contain",
  },
  description: {
    fontSize: 16,
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 10,
    fontFamily: "Shantell",
    marginBottom: 10,
    maxWidth: "90%",
  },
  paginationContainer: {
    flexDirection: "row",
    marginBottom: 20,
  },
  dot: {
    height: 10,
    width: 10,
    borderRadius: 5,
    backgroundColor: "rgba(255, 255, 255, 0.4)",
    marginHorizontal: 5,
  },
  activeDot: {
    backgroundColor: "#FF9A55",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nextButton: {
    borderRadius: 50,
    overflow: "hidden",
  },
  nextButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 50,
  },
  nextButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: "Shantell",
  },
  nextButtonArrow: {
    color: "#fff",
    fontSize: 20,
    marginLeft: 10,
  },

  nextButtonContent: {
    backgroundColor: "#FF9A55",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 50,
  },
});
