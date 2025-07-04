import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView, Alert, TextInput, Modal, Platform, ImageBackground, Share } from 'react-native';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SavedSignal = {
  name: string;
  frequency: number;
  altitude: number;
  azimuth: number;
  audioBase64?: string;
};

export default function SavedSignalsList() {
  const [signals, setSignals] = useState<SavedSignal[]>([]);
  const [isSaveModalVisible, setIsSaveModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [signalName, setSignalName] = useState('');
  const [frequency, setFrequency] = useState(0);
  const [altitude, setAltitude] = useState(0);
  const [azimuth, setAzimuth] = useState(0);
  const [recordedAudioRef, setRecordedAudioRef] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  useEffect(() => {
    const loadSavedSignals = async () => {
      try {
        const saved = await AsyncStorage.getItem('savedSignals');
        if (saved) {
          setSignals(JSON.parse(saved));
        } else {
          setSignals([]);
        }
      } catch (error) {
        console.error('Error loading saved signals:', error);
        Alert.alert('Error', 'Failed to load saved signals.');
        setSignals([]);
      } finally {
      }
    };
    loadSavedSignals();
  }, []);

  const saveSignal = async () => {
    if (!signalName) {
      Alert.alert('Error', 'Please enter a signal name.');
      return;
    }
    const newSignal: SavedSignal = {
      name: signalName,
      frequency,
      altitude,
      azimuth,
      audioBase64: recordedAudioRef || undefined,
    };
    const updatedSignals = [...signals, newSignal];
    setSignals(updatedSignals);
    try {
      await AsyncStorage.setItem('savedSignals', JSON.stringify(updatedSignals));
      Alert.alert('Success', 'Signal saved successfully!');
    } catch (error) {
      console.error('Error saving signal:', error);
      Alert.alert('Error', 'Failed to save signal.');
    }
    setSignalName('');
    setFrequency(0);
    setAltitude(0);
    setAzimuth(0);
    setRecordedAudioRef(null);
    setIsSaveModalVisible(false);
  };

  const handleEdit = (index: number) => {
    const signal = signals[index];
    setEditingIndex(index);
    setSignalName(signal.name);
    setFrequency(signal.frequency);
    setAltitude(signal.altitude);
    setAzimuth(signal.azimuth);
    setRecordedAudioRef(signal.audioBase64 || null);
    setIsEditModalVisible(true);
  };

  const saveEditedSignal = async () => {
    if (!signalName) {
      Alert.alert('Error', 'Please enter a signal name.');
      return;
    }
    if (editingIndex !== null) {
      const updatedSignals = signals.map((s, i) =>
        i === editingIndex
          ? { name: signalName, frequency, altitude, azimuth, audioBase64: recordedAudioRef || undefined }
          : s
      );
      setSignals(updatedSignals);
      try {
        await AsyncStorage.setItem('savedSignals', JSON.stringify(updatedSignals));
        Alert.alert('Success', 'Signal updated successfully!');
      } catch (error) {
        console.error('Error updating signal:', error);
        Alert.alert('Error', 'Failed to update signal.');
      }
      setSignalName('');
      setFrequency(0);
      setAltitude(0);
      setAzimuth(0);
      setRecordedAudioRef(null);
      setEditingIndex(null);
      setIsEditModalVisible(false);
    }
  };

  const handleDelete = (index: number) => {
    Alert.alert(
      'Delete',
      `Are you sure you want to delete ${signals[index].name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            const updatedSignals = signals.filter((_, i) => i !== index);
            setSignals(updatedSignals);
            await AsyncStorage.setItem('savedSignals', JSON.stringify(updatedSignals));
          },
        },
      ]
    );
  };

  const handleShare = async (index: number) => {
    const signal = signals[index];
    const message = `Signal: ${signal.name}\nFrequency: ${signal.frequency} MHz\nAltitude: ${signal.altitude}°\nAzimuth: ${signal.azimuth}°`;
    try {
      await Share.share({
        message: message,
        title: 'Saved Signal',
      });
    } catch (error) {
      console.error('Error sharing signal:', error);
      Alert.alert('Error', 'Failed to share signal. Please try again.');
    }
  };

  const navigateToSignalDetail = useCallback((item: SavedSignal) => {
    router.push({
      pathname: "/menu/saved-signal-detail",
      params: {
        name: item.name,
        frequency: item.frequency.toString(),
        altitude: item.altitude.toString(),
        azimuth: item.azimuth.toString(),
      },
    });
  }, []);


  const renderSignalCard = ({ item, index }: { item: SavedSignal; index: number }) => (
    <View style={styles.cardContainer}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardSubtitle}>Saved Signal</Text>
      </View>

      <View style={styles.detailsContainer}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Frequency</Text>
          <Text style={styles.detailValue}>{item.frequency} MHz</Text>
        </View>
        <View style={styles.detailRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Azimuth / Altitude</Text>
            <Text style={styles.detailValue}>{`${item.azimuth.toFixed(1)}° / ${item.altitude.toFixed(1)}°`}</Text>
          </View>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleEdit(index)}>
          <AntDesign name="edit" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleDelete(index)}>
          <AntDesign name="delete" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => handleShare(index)}>
          <AntDesign name="sharealt" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.listenButton}
          onPress={() => navigateToSignalDetail(item)}
        >
          <Text style={styles.listenButtonText}>Listen & Track</Text>
        </TouchableOpacity>
      </View>
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
            <Text style={styles.headerTitle}>Saved Signals</Text>
          </View>
        </View>
        <FlatList
          data={signals}
          renderItem={renderSignalCard}
          keyExtractor={(item, index) => `${item.name}-${item.frequency}-${index}`}
          contentContainerStyle={styles.listContentContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={styles.emptyText}>No signals saved.</Text>}
        />
        <Modal
          animationType="slide"
          transparent={true}
          visible={isSaveModalVisible}
          onRequestClose={() => setIsSaveModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Save Signal</Text>
              <TextInput
                style={styles.input}
                value={signalName}
                onChangeText={setSignalName}
                placeholder="Enter signal name"
                placeholderTextColor="#888"
              />
              <TextInput
                style={styles.input}
                value={frequency ? frequency.toString() : ''}
                onChangeText={(text) => setFrequency(parseFloat(text) || 0)}
                placeholder="Enter frequency (MHz)"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={altitude ? altitude.toString() : ''}
                onChangeText={(text) => setAltitude(parseFloat(text) || 0)}
                placeholder="Enter altitude (°)"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={azimuth ? azimuth.toString() : ''}
                onChangeText={(text) => setAzimuth(parseFloat(text) || 0)}
                placeholder="Enter azimuth (°)"
                keyboardType="numeric"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalButton} onPress={saveSignal}>
                  <Text style={styles.modalButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButton} onPress={() => setIsSaveModalVisible(false)}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="slide"
          transparent={true}
          visible={isEditModalVisible}
          onRequestClose={() => setIsEditModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Edit Signal</Text>
              <TextInput
                style={styles.input}
                value={signalName}
                onChangeText={setSignalName}
                placeholder="Enter signal name"
                placeholderTextColor="#888"
              />
              <TextInput
                style={styles.input}
                value={frequency ? frequency.toString() : ''}
                onChangeText={(text) => setFrequency(parseFloat(text) || 0)}
                placeholder="Enter frequency (MHz)"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={altitude ? altitude.toString() : ''}
                onChangeText={(text) => setAltitude(parseFloat(text) || 0)}
                placeholder="Enter altitude (°)"
                keyboardType="numeric"
              />
              <TextInput
                style={styles.input}
                value={azimuth ? azimuth.toString() : ''}
                onChangeText={(text) => setAzimuth(parseFloat(text) || 0)}
                placeholder="Enter azimuth (°)"
                keyboardType="numeric"
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.modalButton} onPress={saveEditedSignal}>
                  <Text style={styles.modalButtonText}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalButton} onPress={() => setIsEditModalVisible(false)}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    resizeMode: 'cover',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 40,
    paddingBottom: 10,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
  },
  backCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  listContentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 15,
  },
  cardContainer: {
    flex: 1,
    borderRadius: 30,
    paddingVertical: 20,
    marginVertical: 8,
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
    marginBottom: 20,
  },
  cardTitle: {
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  cardSubtitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 16,
    fontStyle: 'italic',
  },
  detailsContainer: {
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
    marginBottom: 15,
  },
  detailLabel: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 13,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  detailValue: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 0,
  },
  actionButton: {
    padding: 20,
    marginRight: 7,
    borderRadius: 100,
    paddingVertical: 20,
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
  listenButton: {
    borderRadius: 30,
    paddingVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
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
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
    textAlign: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    color: 'white',
    fontSize: 16,
    marginTop: 20,
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: '80%',
    padding: 20,
    backgroundColor: "rgba(0,0,0,0.8)",
    borderWidth: 2,
    borderColor: "#FF833A",
    borderStyle: "dashed",
    borderRadius: 30,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '500',
    color: 'white',
    textAlign: 'center',
    fontFamily: 'Shantell',
    marginBottom: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: 'white',
    borderRadius: 30,
    padding: 12,
    marginBottom: 20,
    color: 'white',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    padding: 12,
    backgroundColor: '#f9884a',
    borderRadius: 30,
  },
  modalButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 16,
  },
});