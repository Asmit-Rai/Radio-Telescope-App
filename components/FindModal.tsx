import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';
import  styles  from '../utils/styles';

interface FindModalProps {
  visible: boolean;
  findAltitude: string;
  findAzimuth: string;
  setFindAltitude: (value: string) => void;
  setFindAzimuth: (value: string) => void;
  onFind: () => void;
  onCancel: () => void;
}

const FindModal: React.FC<FindModalProps> = ({ visible, findAltitude, findAzimuth, setFindAltitude, setFindAzimuth, onFind, onCancel }) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Find Signal</Text>
        <TextInput
          style={styles.input}
          placeholder="Altitude (0-180°)"
          placeholderTextColor="#666"
          value={findAltitude}
          onChangeText={setFindAltitude}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Azimuth (0-360°)"
          placeholderTextColor="#666"
          value={findAzimuth}
          onChangeText={setFindAzimuth}
          keyboardType="numeric"
        />
        <View style={styles.modalButtonContainer}>
          <TouchableOpacity style={styles.modalButton} onPress={onCancel}>
            <Text style={styles.modalButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalButton} onPress={onFind}>
            <Text style={styles.modalButtonText}>Find</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

export default FindModal;