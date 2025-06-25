import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ScrollView, Animated, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, MaterialIcons, FontAwesome5 } from '@expo/vector-icons';
import { Module, initialModules } from '../../../../data/dummyData';

const GOAL = 20;

export default function ModulesScreen() {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>(initialModules);
  const [completedCount, setCompletedCount] = useState(0);
  const [fadeAnim] = useState(new Animated.Value(1));
  const [moduleProgress, setModuleProgress] = useState<{[key: string]: number}>({});
  const [unlockedModules, setUnlockedModules] = useState<string[]>([]);
  const [achievements, setAchievements] = useState<string[]>([]);
  const [showAchievement, setShowAchievement] = useState(false);
  const [newAchievement, setNewAchievement] = useState('');

  const loadData = async () => {
    try {
      const storedModules = await AsyncStorage.getItem('modules');
      const storedProgress = await AsyncStorage.getItem('moduleProgress');
      const storedAchievements = await AsyncStorage.getItem('achievements');
      const storedUnlocked = await AsyncStorage.getItem('unlockedModules');
      
      const currentModules = storedModules ? JSON.parse(storedModules) : initialModules;
      const progress = storedProgress ? JSON.parse(storedProgress) : {};
      const userAchievements = storedAchievements ? JSON.parse(storedAchievements) : [];
      const unlocked = storedUnlocked ? JSON.parse(storedUnlocked) : [initialModules[0]?.id];
      
      const updatedModules = currentModules.map((module: Module, index: number) => {
        const isUnlocked = unlocked.includes(module.id);
        const moduleProgress = progress[module.id] || 0;
        
        if (!isUnlocked) {
          return { ...module, status: 'locked' };
        } else if (moduleProgress >= 100) {
          return { ...module, status: 'completed' };
        } else if (moduleProgress > 0) {
          return { ...module, status: 'in-progress' };
        } else {
          return { ...module, status: 'available' };
        }
      });
      
      setModules(updatedModules);
      setModuleProgress(progress);
      setUnlockedModules(unlocked);
      setAchievements(userAchievements);
      setCompletedCount(updatedModules.filter((m: Module) => m.status === 'completed').length);
      
      if (!storedModules) {
        await AsyncStorage.setItem('modules', JSON.stringify(updatedModules));
      }
      if (!storedUnlocked) {
        await AsyncStorage.setItem('unlockedModules', JSON.stringify(unlocked));
      }
    } catch (e) {
      console.error('Failed to load modules:', e);
    }
  };

  const checkForAchievements = async (completedCount: number) => {
    const newAchievements = [];
    
    if (completedCount >= 1 && !achievements.includes('first_module')) {
      newAchievements.push('first_module');
      showAchievementAlert('First Steps!', 'You completed your first module!');
    }
    if (completedCount >= 3 && !achievements.includes('getting_started')) {
      newAchievements.push('getting_started');
      showAchievementAlert('Getting Started!', 'You completed 3 modules!');
    }
    if (completedCount >= 5 && !achievements.includes('learner')) {
      newAchievements.push('learner');
      showAchievementAlert('Dedicated Learner!', 'You completed 5 modules!');
    }
    if (completedCount >= 10 && !achievements.includes('scholar')) {
      newAchievements.push('scholar');
      showAchievementAlert('Scholar!', 'You completed 10 modules!');
    }
    
    if (newAchievements.length > 0) {
      const updatedAchievements = [...achievements, ...newAchievements];
      setAchievements(updatedAchievements);
      await AsyncStorage.setItem('achievements', JSON.stringify(updatedAchievements));
    }
  };

  const showAchievementAlert = (title: string, message: string) => {
    Alert.alert(
      'Achievement Unlocked!',
      `${title}\n${message}`,
      [{ text: 'Awesome!', style: 'default' }]
    );
  };

  const unlockNextModule = async (currentModuleId: string) => {
    const currentIndex = modules.findIndex(m => m.id === currentModuleId);
    if (currentIndex < modules.length - 1) {
      const nextModule = modules[currentIndex + 1];
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
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    checkForAchievements(completedCount);
  }, [completedCount]);

  const progress = GOAL > 0 ? (completedCount / GOAL) * 100 : 0;

  const getModuleIcon = (status: Module['status'], progress: number = 0) => {
    switch (status) {
      case 'completed':
        return <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />;
      case 'in-progress':
        return <Ionicons name="book" size={16} color="#FF9F45" />;
      case 'locked':
        return <Ionicons name="lock-closed" size={16} color="#888" />;
      default:
        return <Ionicons name="document-text" size={16} color="#6C7CE7" />;
    }
  };

  const getEstimatedTime = (moduleId: '1' | '2' | '3' | '4' | '5') => {
    const baseTimes = { '1': 5, '2': 7, '3': 6, '4': 8, '5': 10 };
    return baseTimes[moduleId] || 5;
  };

  const renderStatusBadge = (status: Module['status'], moduleId: string) => {
    const progress = moduleProgress[moduleId] || 0;
    
    if (status === 'completed') {
      return (
        <View style={styles.statusBadge}>
          <Ionicons name="checkmark-circle" size={12} color="#FFFFFF" />
          <Text style={styles.statusText}>Completed</Text>
        </View>
      );
    }
    if (status === 'in-progress') {
      return (
        <View style={styles.statusBadge}>
          <Ionicons name="book" size={12} color="#FFFFFF" />
          <Text style={styles.statusText}>{Math.round(progress)}%</Text>
        </View>
      );
    }
    if (status === 'locked') {
      return (
        <View style={styles.lockedBadge}>
          <Ionicons name="lock-closed" size={10} color="#888" />
          <Text style={styles.lockedBadgeText}>Locked</Text>
        </View>
      );
    }
    return (
      <View style={styles.statusBadge}>
        <Ionicons name="time" size={12} color="#FFFFFF" />
        <Text style={styles.statusText}>{getEstimatedTime(moduleId as '1' | '2' | '3' | '4' | '5')} min</Text>
      </View>
    );
  };

  const renderProgressBar = (moduleId: string, status: Module['status']) => {
    const progress = moduleProgress[moduleId] || 0;
    
    if (status === 'locked' || progress === 0) return null;
    
    return (
      <View style={styles.moduleProgressContainer}>
        <View style={styles.moduleProgressBackground}>
          <View 
            style={[
              styles.moduleProgressFill, 
              { width: `${progress}%` },
              status === 'completed' && styles.completedProgressFill
            ]} 
          />
        </View>
        <Text style={styles.moduleProgressText}>{Math.round(progress)}%</Text>
      </View>
    );
  };

  const animateCard = () => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.3,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleModulePress = (module: Module) => {
    if (module.status === 'locked') {
      Alert.alert(
        'Module Locked',
        'You need to complete the previous module to unlock this one.',
        [{ text: 'OK', style: 'default' }]
      );
      return;
    }
    
    animateCard();
    setTimeout(() => {
      router.push({
        pathname: '/menu/learning-center/modules/module-details',
        params: { 
          moduleId: module.id,
          unlockNext: 'true'
        },
      });
    }, 400);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            console.log('Navigating back to LearningCenterScreen');
            router.back();
          }}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={28} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Learning Modules</Text>
        {achievements.length > 0 && (
          <View style={styles.achievementIndicator}>
            <Text style={styles.achievementCount}>{achievements.length}</Text>
            <FontAwesome5 name="trophy" size={14} color="#FFD700" />
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Animated.View style={[styles.card, { opacity: fadeAnim }]}>
          <View style={styles.cardHeader}>
            <Image source={require('../../../../assets/background/module1.png')} style={styles.illustration} />
            <View style={styles.headerTextContainer}>
              <Text style={styles.cardTitle}>Educational Modules</Text>
              <Text style={styles.cardSubtitle}>Modules completed:</Text>
              <Text style={styles.completedNumber}>{completedCount}</Text>
              {progress >= 25 && (
                <View style={styles.progressBadge}>
                  <MaterialIcons name="track-changes" size={12} color="#66DE93" />
                  <Text style={styles.progressBadgeText}>{Math.round(progress)}% Complete</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={styles.progressTextContainer}>
              <Text style={styles.progressLabel}>Done {completedCount}</Text>
              <Text style={styles.progressLabel}>Goal {GOAL}</Text>
            </View>
            <View style={styles.progressBarBackground}>
              <Animated.View 
                style={[
                  styles.progressBarFill, 
                  { width: `${progress}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressPercentage}>{Math.round(progress)}%</Text>
          </View>

          <View style={styles.listContainer}>
            {modules.map(module => (
              <TouchableOpacity
                key={module.id}
                style={[
                  styles.listItem,
                  module.status === 'completed' && styles.completedItem,
                  module.status === 'in-progress' && styles.inProgressItem,
                  module.status === 'locked' && styles.lockedItem,
                ]}
                onPress={() => handleModulePress(module)}
                disabled={module.status === 'locked'}
                activeOpacity={module.status === 'locked' ? 1 : 0.8}
              >
                <View style={styles.moduleInfo}>
                  <View style={styles.moduleHeader}>
                    <View style={styles.moduleIcon}>
                      {getModuleIcon(module.status, moduleProgress[module.id])}
                    </View>
                    <Text style={[
                      styles.itemText, 
                      module.status === 'locked' && styles.lockedText
                    ]}>
                      {module.title}
                    </Text>
                  </View>
                  {renderProgressBar(module.id, module.status)}
                </View>
                {renderStatusBadge(module.status, module.id)}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.tipsContainer}>
            <View style={styles.tipsHeader}>
              <Ionicons name="bulb" size={16} color="#FFF" />
              <Text style={styles.tipsTitle}>Learning Tips</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="arrow-forward" size={12} color="#EADFFF" />
              <Text style={styles.tipsText}>Complete modules in order to unlock new content</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="arrow-forward" size={12} color="#EADFFF" />
              <Text style={styles.tipsText}>Track your progress and aim for daily learning</Text>
            </View>
            <View style={styles.tipItem}>
              <Ionicons name="arrow-forward" size={12} color="#EADFFF" />
              <Text style={styles.tipsText}>Review completed modules to reinforce learning</Text>
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#121212' },
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
    color: 'white',
    fontSize: 26,
    fontFamily: 'Shantell',
    marginLeft: 15,
    flex: 1,
  },
  achievementIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 15,
    gap: 4,
  },
  achievementCount: {
    color: '#FFD700',
    fontSize: 12,
    fontFamily: 'Shantell',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  illustration: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
  },
  headerTextContainer: {
    marginLeft: 15,
    flex: 1,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 22,
    fontFamily: 'Shantell',
    lineHeight: 34,
  },
  cardSubtitle: {
    color: '#EADFFF',
    fontSize: 16,
    fontFamily: 'Shantell',
  },
  completedNumber: {
    color: '#FFF',
    fontSize: 48,
    fontFamily: 'Poppins_700Bold',
    marginTop: 5,
  },
  progressBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(102, 222, 147, 0.8)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    marginTop: 8,
    alignSelf: 'flex-start',
    gap: 4,
    width:'50%',
  },
  progressBadgeText: {
    color: '#66DE93',
    fontSize: 12,
    fontFamily: 'Shantell',
    textAlign: 'center',
    width: '100%',
  },
  progressContainer: {
    marginBottom: 25,
  },
  progressTextContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    color: '#EADFFF',
    fontSize: 14,
    fontFamily: 'Shantell',
    width: '50%',
    textAlign: 'center',
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#66DE93',
    borderRadius: 5,
  },
  progressPercentage: {
    color: '#EADFFF',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
    textAlign: 'center',
    marginTop: 5,
  },
  listContainer: {
    gap: 15,
    width: '100%',
    
  },
  listItem: {
    borderRadius: 15,
    paddingVertical: 20, // Increased from 15
    paddingHorizontal: 25, // Increased from 20
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 80, // Added minimum height
  },
  completedItem: {
    backgroundColor: '#FF833A',
  },
  inProgressItem: {
    backgroundColor: '#6C7CE7', // Changed from white to blue for better visibility
  },
  lockedItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Changed from solid white
    opacity: 0.8, // Slightly increased opacity
  },
  moduleInfo: {
    flex: 1,
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  moduleIcon: {
    marginRight: 10,
    width: 20,
    alignItems: 'center',
  },
  itemText: {
    color: '#FFFFFF',
    fontSize: 18, // Increased from 16
    fontFamily: 'Shantell',
    flex: 1,
    fontWeight: '600', // Added font weight for better visibility
  },
  lockedText: {
    color: '#FFF', // Changed from '#333' to white
    opacity: 0.7, // Added opacity for locked state
    
  },
  moduleProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginLeft: 30,
  },
  moduleProgressBackground: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginRight: 8,
  },
  moduleProgressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  completedProgressFill: {
    backgroundColor: 'white',
  },
  moduleProgressText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'Poppins_500Medium',
    minWidth: 30,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Poppins_500Medium',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    gap: 4,
  },
  lockedBadgeText: {
    color: '#888',
    fontFamily: 'Poppins_500Medium',
    fontSize: 12,
  },
  tipsContainer: {
    marginTop: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 15,
    padding: 15,
    width: '100%',
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  tipsTitle: {
    color: '#FFF',
    fontSize: 16,
    fontFamily: 'Shantell',
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  tipsText: {
    color: '#EADFFF',
    fontSize: 14,
    fontFamily: 'Shantell',
    flex: 1,
    lineHeight: 20,
  },
});