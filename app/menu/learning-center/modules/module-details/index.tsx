import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, ScrollView, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Module, initialModules } from '../../../../../data/dummyData';

interface LearningStats {
  totalTimeSpent: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string;
  achievements: string[];
}

export default function ModuleDetailScreen() {
  const router = useRouter();
  const { moduleId, unlockNext } = useLocalSearchParams<{ moduleId: string; unlockNext?: string }>();
  const [module, setModule] = useState<Module | null>(null);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [moduleProgress, setModuleProgress] = useState<{[key: string]: number}>({});
  const [unlockedModules, setUnlockedModules] = useState<string[]>([]);
  const [readingTime, setReadingTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const loadModuleData = async () => {
    try {
      const storedModulesJson = await AsyncStorage.getItem('modules');
      const storedProgress = await AsyncStorage.getItem('moduleProgress');
      const storedUnlocked = await AsyncStorage.getItem('unlockedModules');
      
      const allModules: Module[] = storedModulesJson ? JSON.parse(storedModulesJson) : initialModules;
      const progress = storedProgress ? JSON.parse(storedProgress) : {};
      const unlocked = storedUnlocked ? JSON.parse(storedUnlocked) : [initialModules[0]?.id];
      
      const currentModule = allModules.find(m => m.id === moduleId);
      
      if (currentModule) {
        // Update module status based on progress and unlocked state
        const isUnlocked = unlocked.includes(currentModule.id);
        const moduleProgressValue = progress[currentModule.id] || 0;
        
        let updatedModule = { ...currentModule };
        if (!isUnlocked) {
          updatedModule.status = 'locked';
        } else if (moduleProgressValue >= 100) {
          updatedModule.status = 'completed';
        } else if (moduleProgressValue > 0) {
          updatedModule.status = 'in-progress';
        } else {
          updatedModule.status = 'available';
        }
        
        setModule(updatedModule);
        setModuleProgress(progress);
        setUnlockedModules(unlocked);
        setStartTime(Date.now());
        
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      } else {
        console.warn(`Module with ID ${moduleId} not found`);
      }
    } catch (e) {
      console.error('Failed to load module data:', e);
      Alert.alert('Error', 'Failed to load module data. Please try again.');
    }
  };

  const updateLearningStats = async (timeSpent: number) => {
    try {
      const storedStats = await AsyncStorage.getItem('learningStats');
      const currentStats: LearningStats = storedStats ? JSON.parse(storedStats) : {
        totalTimeSpent: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: '',
        achievements: []
      };

      const today = new Date().toDateString();
      const lastStudyDate = new Date(currentStats.lastStudyDate).toDateString();
      
      let newStreak = currentStats.currentStreak;
      if (lastStudyDate !== today) {
        if (lastStudyDate === new Date(Date.now() - 86400000).toDateString()) {
          // Studied yesterday, continue streak
          newStreak += 1;
        } else {
          // Streak broken, start new
          newStreak = 1;
        }
      }

      const updatedStats: LearningStats = {
        ...currentStats,
        totalTimeSpent: currentStats.totalTimeSpent + timeSpent,
        currentStreak: newStreak,
        longestStreak: Math.max(currentStats.longestStreak, newStreak),
        lastStudyDate: new Date().toISOString(),
      };

      await AsyncStorage.setItem('learningStats', JSON.stringify(updatedStats));
    } catch (e) {
      console.error('Failed to update learning stats:', e);
    }
  };

  const checkForAchievements = async (modules: Module[]) => {
    try {
      const storedStats = await AsyncStorage.getItem('learningStats');
      const stats: LearningStats = storedStats ? JSON.parse(storedStats) : {
        totalTimeSpent: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastStudyDate: '',
        achievements: []
      };

      const completedCount = modules.filter(m => m.status === 'completed').length;
      const newAchievements: string[] = [];

      // Achievement logic
      if (completedCount >= 1 && !stats.achievements.includes('first_module')) {
        newAchievements.push('first_module');
      }
      if (completedCount >= 5 && !stats.achievements.includes('explorer')) {
        newAchievements.push('explorer');
      }
      if (completedCount >= 10 && !stats.achievements.includes('scholar')) {
        newAchievements.push('scholar');
      }
      if (stats.currentStreak >= 7 && !stats.achievements.includes('week_streak')) {
        newAchievements.push('week_streak');
      }

      if (newAchievements.length > 0) {
        const updatedStats = {
          ...stats,
          achievements: [...stats.achievements, ...newAchievements]
        };
        await AsyncStorage.setItem('learningStats', JSON.stringify(updatedStats));

        // Show achievement alert
        const achievementNames = {
          first_module: '🎉 First Steps!',
          explorer: '🚀 Space Explorer!',
          scholar: '🎓 Cosmic Scholar!',
          week_streak: '🔥 Week Warrior!'
        };

        Alert.alert(
          'Achievement Unlocked!',
          newAchievements.map(a => achievementNames[a as keyof typeof achievementNames]).join('\n'),
          [{ text: 'Awesome!', style: 'default' }]
        );
      }
    } catch (e) {
      console.error('Failed to check achievements:', e);
    }
  };

  const unlockNextModule = async (currentModuleId: string) => {
    if (unlockNext !== 'true') return;
    
    try {
      const storedModulesJson = await AsyncStorage.getItem('modules');
      const allModules: Module[] = storedModulesJson ? JSON.parse(storedModulesJson) : initialModules;
      
      const currentIndex = allModules.findIndex(m => m.id === currentModuleId);
      if (currentIndex < allModules.length - 1) {
        const nextModule = allModules[currentIndex + 1];
        if (!unlockedModules.includes(nextModule.id)) {
          const updatedUnlocked = [...unlockedModules, nextModule.id];
          setUnlockedModules(updatedUnlocked);
          await AsyncStorage.setItem('unlockedModules', JSON.stringify(updatedUnlocked));
          
          Alert.alert(
            'New Module Unlocked!',
            `You can now access: ${nextModule.title}`,
            [{ text: 'Great!', style: 'default' }]
          );
        }
      }
    } catch (e) {
      console.error('Failed to unlock next module:', e);
    }
  };

  const handleCompleteModule = async () => {
    if (!module || module.status === 'completed') return;

    try {
      const storedModulesJson = await AsyncStorage.getItem('modules');
      let allModules: Module[] = storedModulesJson ? JSON.parse(storedModulesJson) : initialModules;

      // Calculate reading time
      const timeSpent = startTime ? Math.round((Date.now() - startTime) / 60000) : 5; // Default 5 minutes if no start time
      
      // Update module progress to 100%
      const updatedProgress = {
        ...moduleProgress,
        [module.id]: 100
      };
      await AsyncStorage.setItem('moduleProgress', JSON.stringify(updatedProgress));

      // Update current module to completed
      const currentModuleIndex = allModules.findIndex(m => m.id === moduleId);
      const updatedModules = [...allModules];
      updatedModules[currentModuleIndex] = { ...module, status: 'completed' };

      await AsyncStorage.setItem('modules', JSON.stringify(updatedModules));
      setModule({ ...module, status: 'completed' });

      // Update learning stats
      await updateLearningStats(timeSpent);

      // Check for achievements
      await checkForAchievements(updatedModules);

      // Unlock next module
      await unlockNextModule(module.id);

      // Trigger animation
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0.5,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      Alert.alert(
        'WELL DONE!',
        'Module Completed! You\'ve unlocked the next module. Keep exploring the universe!',
        [{ text: 'Continue Learning', onPress: () => router.back() }]
      );
    } catch (e) {
      console.error('Failed to complete module:', e);
      Alert.alert('Error', 'Could not save your progress. Please try again.');
    }
  };

  useEffect(() => {
    if (moduleId) {
      console.log(`Loading module data for moduleId: ${moduleId}`);
      loadModuleData();
    } else {
      console.warn('No moduleId provided');
    }

    // Cleanup function to save reading time
    return () => {
      if (startTime && module && module.status !== 'completed') {
        const timeSpent = Math.round((Date.now() - startTime) / 60000);
        updateLearningStats(timeSpent);
      }
    };
  }, [moduleId]);

  if (!moduleId) {
    return (
      <SafeAreaView style={styles.loader}>
        <Text style={styles.errorText}>Invalid module ID</Text>
      </SafeAreaView>
    );
  }

  if (!module) {
    return (
      <SafeAreaView style={styles.loader}>
        <Text style={styles.errorText}>Loading module...</Text>
      </SafeAreaView>
    );
  }

  if (module.status === 'locked') {
    return (
     
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={28} color="white" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Module Locked</Text>
          </View>
          <View style={styles.lockedContainer}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>Module Locked</Text>
            <Text style={styles.lockedMessage}>
              Complete the previous module to unlock this content.
            </Text>
            <TouchableOpacity
              style={styles.backToModulesButton}
              onPress={() => router.back()}
            >
              <Text style={styles.backToModulesText}>Back to Modules</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
    );
  }

  const isCompleted = module.status === 'completed';
  const currentProgress = moduleProgress[module.id] || 0;

  return (
   
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              console.log('Navigating back from ModuleDetailScreen');
              router.back();
            }}
            style={styles.backButton}
          >
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Module Details</Text>
          {isCompleted && (
            <View style={styles.completedBadge}>
              <Text style={styles.completedBadgeText}>✓</Text>
            </View>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Animated.View style={[styles.contentCard, { opacity: fadeAnim }]}>
            <View style={styles.moduleHeader}>
              <Text style={styles.moduleTitle}>{module.title}</Text>
              {module.status === 'in-progress' && (
                <View style={styles.progressBadge}>
                  <Text style={styles.progressBadgeText}>{Math.round(currentProgress)}% Complete</Text>
                </View>
              )}
            </View>
            
            {/* Progress bar for in-progress modules */}
            {module.status === 'in-progress' && currentProgress > 0 && (
              <View style={styles.detailProgressContainer}>
                <View style={styles.detailProgressBackground}>
                  <View
                    style={[
                      styles.detailProgressFill,
                      { width: `${currentProgress}%` }
                    ]}
                  />
                </View>
                <Text style={styles.detailProgressText}>{Math.round(currentProgress)}%</Text>
              </View>
            )}
            
            <View style={styles.divider} />
            <Text style={styles.moduleContent}>{module.content}</Text>
            
            {/* Estimated reading time */}
            <View style={styles.readingTimeContainer}>
              <Ionicons name="time-outline" size={16} color="#666" />
              <Text style={styles.readingTimeText}>
                Estimated reading time: {Math.max(Math.ceil(module.content.length / 200), 3)} minutes
              </Text>
            </View>
          </Animated.View>

          <TouchableOpacity
            style={[styles.completeButton, isCompleted && styles.completedButton]}
            onPress={handleCompleteModule}
            disabled={isCompleted}
          >
            <Text style={styles.completeButtonText}>
              {isCompleted ? '✓ Module Completed' : 'Mark as Completed'}
            </Text>
          </TouchableOpacity>

          {/* Learning tips */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipsTitle}>💡 Learning Tip</Text>
            <Text style={styles.tipsText}>
              Take your time to understand the content. You can always revisit completed modules to reinforce your learning!
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF',
  },
  errorText: {
    fontSize: 18,
    color: '#333',
    fontFamily: 'Poppins_500Medium',
  },

  safeArea: { flex: 1 , backgroundColor:'#121212'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  backButton: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    padding: 6,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 26,
    fontFamily: 'Poppins_600SemiBold',
    marginLeft: 15,
    flex: 1,
  },
  completedBadge: {
    backgroundColor: '#66DE93',
    borderRadius: 15,
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completedBadgeText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  contentCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 25,
    marginBottom: 25,
  },
  moduleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  moduleTitle: {
    fontSize: 24,
    fontFamily: 'Poppins_700Bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  progressBadge: {
    backgroundColor: 'rgba(102, 222, 147, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  progressBadgeText: {
    color: '#66DE93',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  detailProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  detailProgressBackground: {
    flex: 1,
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginRight: 10,
  },
  detailProgressFill: {
    height: '100%',
    backgroundColor: '#66DE93',
    borderRadius: 3,
  },
  detailProgressText: {
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    color: '#66DE93',
    minWidth: 35,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 15,
  },
  moduleContent: {
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    color: '#555',
    lineHeight: 26,
    marginBottom: 15,
  },
  readingTimeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 8,
  },
  readingTimeText: {
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    color: '#666',
    marginLeft: 5,
  },
  completeButton: {
    backgroundColor: '#66DE93',
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    marginBottom: 20,
  },
  completedButton: {
    backgroundColor: '#4CAF50',
  },
  completeButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontFamily: 'Poppins_600SemiBold',
  },
  tipsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 15,
  },
  tipsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
    marginBottom: 8,
  },
  tipsText: {
    color: '#EADFFF',
    fontSize: 14,
    fontFamily: 'Poppins_400Regular',
    lineHeight: 20,
  },
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  lockedIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  lockedTitle: {
    color: '#FFF',
    fontSize: 28,
    fontFamily: 'Poppins_700Bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  lockedMessage: {
    color: '#EADFFF',
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  backToModulesButton: {
    backgroundColor: '#66DE93',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 15,
  },
  backToModulesText: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
});