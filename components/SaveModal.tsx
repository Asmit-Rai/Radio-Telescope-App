import React from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';
import styles from '../utils/styles';


interface SaveModalProps {
  visible: boolean;
  signalName: string;
  setSignalName: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const SaveModal: React.FC<SaveModalProps> = ({ visible, signalName, setSignalName, onSave, onCancel }) => (
  <Modal visible={visible} transparent animationType="slide">
    <View style={styles.modalContainer}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Save Signal</Text>
        <TextInput
          style={styles.input}
          placeholder="Signal Name"
          placeholderTextColor="#666"
          value={signalName}
          onChangeText={setSignalName}
        />
        <View style={styles.modalButtonContainer}>
          <TouchableOpacity style={styles.modalButton} onPress={onCancel}>
            <Text style={styles.modalButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.modalButton} onPress={onSave}>
            <Text style={styles.modalButtonText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

export default SaveModal;