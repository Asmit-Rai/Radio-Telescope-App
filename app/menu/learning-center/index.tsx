import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import {
  Module,
  Mission,
  initialModules,
  initialMissions,
} from "../../../data/dummyData";
import { useFocusEffect } from "@react-navigation/native";

const GOAL = 20;

interface LearningStats {
  totalTimeSpent: number; // in minutes
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string;
  achievements: string[];
}

export default function LearningCenterScreen() {
  const router = useRouter();
  const [moduleCount, setModuleCount] = useState<number>(0);
  const [missionCount, setMissionCount] = useState<number>(0);
  const [learningStats, setLearningStats] = useState<LearningStats>({
    totalTimeSpent: 0,
    currentStreak: 0,
    longestStreak: 0,
    lastStudyDate: "",
    achievements: [],
  });
  const [showStats, setShowStats] = useState(false);

  const loadCounts = async () => {
    try {
      const storedModules = await AsyncStorage.getItem("modules");
      const storedMissions = await AsyncStorage.getItem("missions");
      const storedStats = await AsyncStorage.getItem("learningStats");

      const modules: Module[] = storedModules
        ? JSON.parse(storedModules)
        : initialModules;
      const missions: Mission[] = storedMissions
        ? JSON.parse(storedMissions)
        : initialMissions;
      const stats: LearningStats = storedStats
        ? JSON.parse(storedStats)
        : {
            totalTimeSpent: 0,
            currentStreak: 0,
            longestStreak: 0,
            lastStudyDate: "",
            achievements: [],
          };

      setModuleCount(modules.filter((m) => m.status === "completed").length);
      setMissionCount(missions.filter((m) => m.status === "completed").length);
      setLearningStats(stats);

      // Save initial data if not already stored
      if (!storedModules) {
        await AsyncStorage.setItem("modules", JSON.stringify(initialModules));
      }
      if (!storedMissions) {
        await AsyncStorage.setItem("missions", JSON.stringify(initialMissions));
      }
      if (!storedStats) {
        await AsyncStorage.setItem("learningStats", JSON.stringify(stats));
      }

      // Check for new achievements
      checkForAchievements(modules, stats);
    } catch (e) {
      console.error("Failed to load counts:", e);
    }
  };

  const checkForAchievements = async (
    modules: Module[],
    stats: LearningStats
  ) => {
    const completedCount = modules.filter(
      (m) => m.status === "completed"
    ).length;
    const newAchievements: string[] = [];

    // Achievement logic
    if (completedCount >= 1 && !stats.achievements.includes("first_module")) {
      newAchievements.push("first_module");
    }
    if (completedCount >= 5 && !stats.achievements.includes("explorer")) {
      newAchievements.push("explorer");
    }
    if (completedCount >= 10 && !stats.achievements.includes("scholar")) {
      newAchievements.push("scholar");
    }
    if (
      stats.currentStreak >= 7 &&
      !stats.achievements.includes("week_streak")
    ) {
      newAchievements.push("week_streak");
    }

    if (newAchievements.length > 0) {
      const updatedStats = {
        ...stats,
        achievements: [...stats.achievements, ...newAchievements],
      };
      await AsyncStorage.setItem("learningStats", JSON.stringify(updatedStats));
      setLearningStats(updatedStats);

      // Show achievement alert
      const achievementNames = {
        first_module: "🎉 First Steps!",
        explorer: "🚀 Space Explorer!",
        scholar: "🎓 Cosmic Scholar!",
        week_streak: "🔥 Week Warrior!",
      };

      Alert.alert(
        "Achievement Unlocked!",
        newAchievements
          .map((a) => achievementNames[a as keyof typeof achievementNames])
          .join("\n"),
        [{ text: "Awesome!", style: "default" }]
      );
    }
  };

  const resetProgress = () => {
    Alert.alert(
      "Reset Progress",
      "Are you sure you want to reset all learning progress? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem("modules");
              await AsyncStorage.removeItem("missions");
              await AsyncStorage.removeItem("learningStats");
              await AsyncStorage.removeItem("moduleProgress");
              loadCounts();
              Alert.alert("Success", "Progress has been reset successfully!");
            } catch (e) {
              Alert.alert("Error", "Failed to reset progress");
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    loadCounts();
  }, []);

  // Set up focus listener to reload data when returning to screen
  useFocusEffect(
    React.useCallback(() => {
      loadCounts();
    }, [])
  );

  const formatTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const getProgressPercentage = (completed: number) => {
    return Math.min((completed / GOAL) * 100, 100);
  };

  return (
    <ImageBackground
      source={require("../../../assets/background/learning-center.png")}
      style={styles.background}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Learning Center</Text>
          <TouchableOpacity
            onPress={() => setShowStats(!showStats)}
            style={styles.statsButton}
          >
            <Ionicons name="stats-chart" size={24} color="white" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          {/* Stats Card */}
          {showStats && (
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>📊 Learning Statistics</Text>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {formatTime(learningStats.totalTimeSpent)}
                  </Text>
                  <Text style={styles.statLabel}>Study Time</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {learningStats.currentStreak}
                  </Text>
                  <Text style={styles.statLabel}>Current Streak</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>
                    {learningStats.achievements.length}
                  </Text>
                  <Text style={styles.statLabel}>Achievements</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={resetProgress}
                style={styles.resetButton}
              >
                <Text style={styles.resetButtonText}>Reset Progress</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Modules Card */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push("/menu/learning-center/modules")}
          >
            <View style={styles.cardContent}>
              <Image
                source={require("../../../assets/background/exit3.png")}
                style={styles.illustration}
              />
              <View style={styles.textContainer}>
                <Text style={styles.cardTitle}>Educational Modules</Text>
                <Text style={styles.cardSubtitle}>Modules completed:</Text>
                <Text style={styles.completedNumber}>{moduleCount}</Text>
                {moduleCount > 0 && (
                  <View style={styles.achievementBadge}>
                    <Text style={styles.achievementText}>
                      🎯 {getProgressPercentage(moduleCount).toFixed(0)}%
                      Complete
                    </Text>
                  </View>
                )}
              </View>
            </View>
            <View style={styles.progressContainer}>
              <View style={styles.progressTextContainer}>
                <Text style={styles.progressLabel}>Done {moduleCount}</Text>
                <Text style={styles.progressLabel}>Goal {GOAL}</Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.moduleProgressFill,
                    { width: `${getProgressPercentage(moduleCount)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressPercentage}>
                {getProgressPercentage(moduleCount).toFixed(0)}%
              </Text>
            </View>
          </TouchableOpacity>

          {/* Mission Card */}
          <TouchableOpacity
            style={[styles.card, styles.disabledCard]}
            onPress={() => {
              Alert.alert(
                "Coming Soon!",
                "Missions feature will be available in the next update."
              );
            }}
          >
            <View style={styles.cardContent}>
              <Image
                source={require("../../../assets/icons/free.png")}
                style={[styles.illustration, styles.disabledImage]}
              />
              <View style={styles.textContainer}>
                <Text style={[styles.cardTitle, styles.disabledText]}>
                  Missions
                </Text>
                <Text style={[styles.cardSubtitle, styles.disabledText]}>
                  Coming Soon...
                </Text>
                <Text style={[styles.completedNumber, styles.disabledText]}>
                  {missionCount}
                </Text>
              </View>
            </View>
            <View style={styles.progressContainer}>
              <View style={styles.progressTextContainer}>
                <Text style={[styles.progressLabel, styles.disabledText]}>
                  Done {missionCount}
                </Text>
                <Text style={[styles.progressLabel, styles.disabledText]}>
                  Goal {GOAL}
                </Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.missionProgressFill,
                    {
                      width: `${getProgressPercentage(missionCount)}%`,
                      opacity: 0.5,
                    },
                  ]}
                />
              </View>
            </View>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>🚧 Coming Soon</Text>
            </View>
          </TouchableOpacity>

          {/* Achievement Preview */}
          {learningStats.achievements.length > 0 && (
            <View style={styles.achievementsPreview}>
              <Text style={styles.achievementsTitle}>
                🏆 Recent Achievements
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {learningStats.achievements
                  .slice(-3)
                  .map((achievement, index) => (
                    <View key={index} style={styles.achievementItem}>
                      <Text style={styles.achievementIcon}>
                        {achievement === "first_module" && "🎉"}
                        {achievement === "explorer" && "🚀"}
                        {achievement === "scholar" && "🎓"}
                        {achievement === "week_streak" && "🔥"}
                      </Text>
                    </View>
                  ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    justifyContent: "space-between",
  },
  backButton: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 20,
    padding: 6,
  },
  headerTitle: {
    color: "#FFF",
    fontSize: 26,
    fontFamily: "Shantell",
    flex: 1,
    marginLeft: 15,
  },
  statsButton: {
    backgroundColor: "rgba(0,0,0,0.3)",
    borderRadius: 20,
    padding: 6,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  statsCard: {
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    borderRadius: 20,
    padding: 20,
    marginBottom: 10,
  },
  statsTitle: {
    fontSize: 18,
    fontFamily: "Shantell",
    color: "#333",
    marginBottom: 15,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 15,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontFamily: "Shantell",
    color: "#66DE93",
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Shantell",
    color: "#666",
  },
  resetButton: {
    backgroundColor: "#FF6B6B",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    alignSelf: "center",
  },
  resetButtonText: {
    color: "#FFF",
    fontSize: 12,
    fontFamily: "Shantell",
  },
  card: {
    borderRadius: 30,
    padding: 20,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    shadowColor: "rgba(0, 0, 0, 0.4)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    alignItems: "center",
  },
  disabledCard: {
    opacity: 0.7,
  },
  cardContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  illustration: {
    width: 100,
    height: 100,
    resizeMode: "contain",
  },
  disabledImage: {
    opacity: 0.5,
  },
  textContainer: {
    marginLeft: 15,
    flex: 1,
  },
  cardTitle: {
    color: "#FFF",
    fontSize: 24,
    fontFamily: "Shantell",
    lineHeight: 28,
  },
  cardSubtitle: {
    color: "#EADFFF",
    fontSize: 14,
    fontFamily: "Shantell",
  },
  completedNumber: {
    color: "#FFF",
    fontSize: 40,
    fontFamily: "Shantell",
  },
  disabledText: {
    opacity: 0.6,
  },
  achievementBadge: {
    backgroundColor: "rgba(102, 222, 147, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 5,
    alignSelf: "flex-start",
  },
  achievementText: {
    color: "#66DE93",
    fontSize: 12,
    fontFamily: "Shantell",
  },
  progressContainer: {
    marginTop: 15,
  },
  progressTextContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  progressLabel: {
    color: "#EADFFF",
    fontSize: 14,
    fontFamily: "Shantell",
    width: "50%",
    textAlign: "center",
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: "rgba(30, 30, 30, 100)",
    borderRadius: 5,
    overflow: "hidden",
  },
  moduleProgressFill: {
    height: "100%",
    backgroundColor: "#66DE93",
    borderRadius: 5,
  },
  missionProgressFill: {
    height: "100%",
    backgroundColor: "#FF9F45",
    borderRadius: 5,
  },
  progressPercentage: {
    color: "#EADFFF",
    fontSize: 12,
    fontFamily: "Shantell",
    textAlign: "center",
    marginTop: 5,
  },
  comingSoonBadge: {
    position: "absolute",
    top: 15,
    right: 15,
    backgroundColor: "rgba(255, 159, 69, 0.9)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  comingSoonText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Shantell",
  },
  achievementsPreview: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 15,
    padding: 15,
  },
  achievementsTitle: {
    color: "#FFF",
    fontSize: 16,
    fontFamily: "Shantell",
    marginBottom: 10,
  },
  achievementItem: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 25,
    width: 50,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  achievementIcon: {
    fontSize: 24,
  },
});
