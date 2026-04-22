import { Tabs } from 'expo-router';
import React, { useState } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  TouchableOpacity, 
  Platform, 
  Modal, 
  Pressable 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [modalVisible, setModalVisible] = useState(false);

  const ModalOption = ({ icon, title, description }: { icon: any, title: string, description: string }) => (
    <TouchableOpacity style={styles.modalOption} activeOpacity={0.7}>
      <View style={styles.optionIconContainer}>
        <Ionicons name={icon} size={24} color="#000" />
      </View>
      <View style={styles.optionTextContainer}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionDescription}>{description}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#000',
          tabBarInactiveTintColor: '#8E8E93',
          headerShown: false,
          tabBarStyle: {
            height: Platform.OS === 'ios' ? 88 : 68,
            paddingBottom: Platform.OS === 'ios' ? 30 : 10,
            paddingTop: 10,
            backgroundColor: '#FFFFFF',
            borderTopWidth: 0,
            elevation: 0,
            shadowOpacity: 0,
          },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={26} color={color} />
            ),
          }}
        />
        
        {/* Central "Nova Conversa" button */}
        <Tabs.Screen
          name="new-chat-dummy"
          options={{
            title: '',
            tabBarButton: (props) => (
              <View style={styles.centerButtonContainer}>
                <TouchableOpacity 
                  style={styles.newChatButton} 
                  activeOpacity={0.8}
                  onPress={() => setModalVisible(true)}
                >
                  <Ionicons name="add" size={20} color="#FFF" />
                  <Text style={styles.newChatText}>Novo Chat</Text>
                </TouchableOpacity>
              </View>
            ),
          }}
        />

        <Tabs.Screen
          name="profile"
          options={{
            title: 'Perfil',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={26} color={color} />
            ),
          }}
        />

        {/* Hide existing calls tab from layout */}
        <Tabs.Screen
          name="calls"
          options={{
            href: null,
          }}
        />
      </Tabs>

      {/* New Chat Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setModalVisible(false)}
        >
          {/* Simulated Blur Background */}
          <View style={styles.blurSim} />
          
          <View style={styles.modalContent}>
            <View style={styles.optionsContainer}>
              <ModalOption 
                icon="chatbubble-outline" 
                title="Nova Conversa" 
                description="Envie uma mensagem para seus contatos" 
              />
              <View style={styles.divider} />
              <ModalOption 
                icon="person-add-outline" 
                title="Novo Contato" 
                description="Adicione um contato para enviar mensagens" 
              />
              <View style={styles.divider} />
              <ModalOption 
                icon="people-outline" 
                title="Novo Grupo" 
                description="Participe de um Grupo ao seu redor" 
              />
            </View>

            <TouchableOpacity 
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  centerButtonContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newChatButton: {
    backgroundColor: '#000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
    height: 44,
    minWidth: 140,
  },
  newChatText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 32 : 12,
  },
  blurSim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: {
    width: '90%',
    alignItems: 'center',
  },
  optionsContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    padding: 16,
    alignItems: 'center',
  },
  optionIconContainer: {
    marginRight: 16,
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  optionDescription: {
    fontSize: 13,
    color: '#8E8E93',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#F2F2F7',
    marginHorizontal: 16,
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    height: 44,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    width: 140,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
});
