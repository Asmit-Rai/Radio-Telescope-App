import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Mission, initialMissions } from '../../../../data/dummyData';

const GOAL = 20;

export default function MissionsScreen() {
  const navigation = useNavigation();
  const [missions, setMissions] = useState<Mission[]>(initialMissions);

  useEffect(() => {
    const loadData = async () => {
      try {
        const storedMissions = await AsyncStorage.getItem('missions');
        if (storedMissions !== null) {
          setMissions(JSON.parse(storedMissions));
        } else {
          // If no data, save initial data
          await AsyncStorage.setItem('missions', JSON.stringify(initialMissions));
        }
      } catch (e) {
        console.error("Failed to load missions.", e);
      }
    };
    loadData();
  }, []);

  const completedCount = missions.filter(m => m.status === 'completed').length;
  const progress = (completedCount / GOAL) * 100;

  const renderStatus = (status: Mission['status']) => {
    if (status === 'completed') {
      return <Text style={styles.statusText}>Completed</Text>;
    }
    if (status === 'in-progress') {
      return <Text style={styles.statusText}>In Progress</Text>;
    }
    return null;
  };

  return (
  
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="white" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Learning Center</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Image source={require('../../../../assets/background/connect4.png')} style={styles.illustration} />
              <View style={styles.headerTextContainer}>
                <Text style={styles.cardTitle}>Mission</Text>
                <Text style={styles.cardSubtitle}>Mission Completed</Text>
                <Text style={styles.completedNumber}>{completedCount}</Text>
              </View>
            </View>

            <View style={styles.progressContainer}>
              <View style={styles.progressTextContainer}>
                <Text style={styles.progressLabel}>Done {completedCount}</Text>
                <Text style={styles.progressLabel}>Goal {GOAL}</Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
              </View>
            </View>

            <View style={styles.listContainer}>
              {missions.map(mission => (
                <TouchableOpacity
                  key={mission.id}
                  style={[
                    styles.listItem,
                    mission.status === 'completed' && styles.completedItem,
                    mission.status === 'in-progress' && styles.inProgressItem,
                    mission.status === 'locked' && styles.lockedItem,
                  ]}
                  disabled={mission.status === 'locked'}
                >
                  <Text style={[styles.itemText, mission.status === 'locked' && styles.lockedText]}>{mission.title}</Text>
                  {mission.status === 'locked' ? (
                    <View style={styles.plusIconContainer}>
                      <Ionicons name="add" size={24} color="#333" />
                    </View>
                  ) : (
                    renderStatus(mission.status)
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 , backgroundColor: '#121212' },
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
    fontSize: 32,
    fontFamily: 'Poppins_700Bold',
  },
  cardSubtitle: {
    color: '#EADFFF',
    fontSize: 16,
    fontFamily: 'Poppins_400Regular',
    marginTop: -5,
  },
  completedNumber: {
    color: '#FFF',
    fontSize: 48,
    fontFamily: 'Poppins_700Bold',
    marginTop: 5,
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
    fontFamily: 'Poppins_500Medium',
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF9F45',
    borderRadius: 5,
  },
  listContainer: {
    gap: 12,
  },
  listItem: {
    borderRadius: 15,
    paddingVertical: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completedItem: {
    backgroundColor: '#66DE93',
  },
  inProgressItem: {
    backgroundColor: '#FF9F45',
  },
  lockedItem: {
    backgroundColor: '#FFFFFF',
  },
  itemText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Poppins_600SemiBold',
  },
  lockedText: {
    color: '#333',
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Poppins_500Medium',
  },
  plusIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EAEAEA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDDDDD'
  },
});