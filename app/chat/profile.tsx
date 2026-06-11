import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  StatusBar,
  Modal,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts/legacy';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const normalizePhone = (phone?: string) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 9 ? cleaned.slice(-9) : cleaned;
};

export default function ContactProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const conversationId = params.id as string;
  const partnerId = params.partnerId as string;
  const initialName = params.name as string;
  const initialPhone = params.phone as string;
  const profileName = params.profileName as string;
  const avatarImage = params.image as string;
  
  const [isContactSaved, setIsContactSaved] = useState<boolean>(params.isContactSaved === 'true');
  const [partnerPhone, setPartnerPhone] = useState<string>(initialPhone || '');
  const [partnerName, setPartnerName] = useState<string>(initialName || 'Conversa');

  // Toggle state
  const [isChatLocked, setIsChatLocked] = useState(false);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);

  // Check contact status on device
  useEffect(() => {
    const checkContactStatus = async () => {
      if (!partnerPhone) return;
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          const { data } = await Contacts.getContactsAsync({
            fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
          });
          const normalizedPartner = normalizePhone(partnerPhone);
          const contact = data.find(c =>
            c.phoneNumbers?.some(p => p.number && normalizePhone(p.number) === normalizedPartner)
          );
          if (contact) {
            setIsContactSaved(true);
            setPartnerName(contact.name || initialName);
          } else {
            setIsContactSaved(false);
          }
        }
      } catch (error) {
        console.error('Error checking contact status in profile:', error);
      }
    };
    checkContactStatus();
  }, [partnerPhone]);

  const handleAddContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisa permitir o acesso aos contactos.');
        return;
      }
      
      await Contacts.presentFormAsync(undefined, {
        firstName: profileName || partnerName || '',
        phoneNumbers: [{ label: 'mobile', number: partnerPhone }],
      } as any);
      
      // Refresh status after dialog is closed
      setTimeout(async () => {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
        });
        const normalizedPartner = normalizePhone(partnerPhone);
        const contact = data.find(c =>
          c.phoneNumbers?.some(p => p.number && normalizePhone(p.number) === normalizedPartner)
        );
        if (contact) {
          setIsContactSaved(true);
          setPartnerName(contact.name);
        }
      }, 2000);
    } catch (error) {
      console.error('Error adding contact:', error);
      Alert.alert('Erro', 'Não foi possível abrir o formulário de contactos.');
    }
  };

  const handleBlockContact = () => {
    Alert.alert(
      'Bloquear Contacto',
      `Tem a certeza de que deseja bloquear o número ${partnerPhone}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Bloqueado', 'Contacto bloqueado com sucesso.');
          }
        }
      ]
    );
  };

  const handleReportContact = () => {
    Alert.alert(
      'Denunciar Contacto',
      `Deseja denunciar ${partnerName || partnerPhone}? As últimas mensagens deste utilizador serão enviadas para análise.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Denunciar',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Enviado', 'Denúncia enviada com sucesso.');
          }
        }
      ]
    );
  };

  const handleClearChat = () => {
    Alert.alert(
      'Limpar conversa',
      'Tem a certeza de que deseja apagar todas as mensagens desta conversa? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Sucesso', 'Conversa limpa.');
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />
      
      {/* Custom Header */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact info</Text>
        {isContactSaved ? (
          <TouchableOpacity onPress={handleAddContact} style={styles.headerRightButton}>
            <Text style={styles.headerRightText}>Edit</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Profile Details */}
        <View style={styles.profileHeaderContainer}>
          <TouchableOpacity 
            activeOpacity={0.8} 
            onPress={() => setIsImageViewerVisible(true)}
            style={styles.avatarWrapper}
          >
            {avatarImage ? (
              <Image source={{ uri: avatarImage }} style={styles.bigAvatar} />
            ) : (
              <View style={[styles.bigAvatar, styles.avatarPlaceholder]}>
                <Ionicons name="person" size={60} color="#8E8E93" />
              </View>
            )}
          </TouchableOpacity>

          {isContactSaved ? (
            <>
              <Text style={styles.mainTitle}>{partnerName}</Text>
              <Text style={styles.subtitle}>{partnerPhone}</Text>
            </>
          ) : (
            <>
              <Text style={styles.mainTitle}>{partnerPhone}</Text>
              {profileName ? <Text style={styles.subtitle}>~{profileName}</Text> : null}
            </>
          )}
        </View>

        {/* Quick Actions Row */}
        <View style={styles.quickActionsRow}>
          <TouchableOpacity style={styles.quickActionButton} activeOpacity={0.7}>
            <Ionicons name="call" size={22} color="#000000ff" />
            <Text style={styles.quickActionText}>Audio</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickActionButton} activeOpacity={0.7}>
            <Ionicons name="videocam" size={22} color="#000000ff" />
            <Text style={styles.quickActionText}>Video</Text>
          </TouchableOpacity>

          {/*<TouchableOpacity style={styles.quickActionButton} activeOpacity={0.7}>
            <Ionicons name="search" size={22} color="#34C759" />
            <Text style={styles.quickActionText}>Search</Text>
          </TouchableOpacity>*/}
        </View>

        {/* Add Local Contact Card if unsaved */}
        {!isContactSaved && (
          <TouchableOpacity style={styles.blockCard} activeOpacity={0.7} onPress={handleAddContact}>
            <View style={styles.singleRowItem}>
              <Text style={styles.createContactText}>Create new contact</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Block 1: Media & Stars */}
        <View style={styles.blockCard}>
          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="image-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Média, links e docs</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>1</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          {/*<View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="bookmark-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Mensagens mantidas</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>Nenhum</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="star-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Mensagens marcadas</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>Nenhuma</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>*/}
        </View>

        {/* Block 2: App Settings */}
        <View style={styles.blockCard}>
          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="notifications-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Notificações</Text>
            </View>
            <View style={styles.rowRight}>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="color-palette-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Tema da conversa</Text>
            </View>
            <View style={styles.rowRight}>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="download-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Guardar nas Fotos</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>Padrão</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>
        </View>

        {/* Block 3: Security & Privacy */}
        <View style={styles.blockCard}>
          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="time-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Mensagens temporárias</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>Desativado</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.rowItem}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="chatbubble-ellipses-outline" size={22} color="#000" />
              </View>
              <View>
                <Text style={styles.rowLabel}>Bloquear conversa</Text>
                <Text style={styles.rowDesc}>Bloquear e ocultar esta conversa neste dispositivo.</Text>
              </View>
            </View>
            <Switch
              value={isChatLocked}
              onValueChange={setIsChatLocked}
              trackColor={{ false: '#D1D1D6', true: '#34C759' }}
            />
          </View>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="shield-outline" size={22} color="#000" />
              </View>
              <Text style={styles.rowLabel}>Privacidade avançada da conversa</Text>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>Desativado</Text>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.iconContainer}>
                <Ionicons name="lock-closed-outline" size={22} color="#000" />
              </View>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.rowLabel}>Encriptação</Text>
                <Text style={styles.rowDesc}>As mensagens e chamadas são encriptadas de ponta a ponta. Toque para verificar.</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
          </TouchableOpacity>
        </View>

        {/* Contact details row if saved */}
        {isContactSaved && (
          <View style={styles.blockCard}>
            <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={handleAddContact}>
              <View style={styles.rowLeft}>
                <View style={styles.iconContainer}>
                  <Ionicons name="person-circle-outline" size={22} color="#000" />
                </View>
                <Text style={styles.rowLabel}>Detalhes do contacto</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
            </TouchableOpacity>
          </View>
        )}

        {/* Common Groups Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderTitle}>Nenhum grupo em comum</Text>
        </View>

        {/* Block 4: Group Actions */}
        <View style={styles.blockCard}>
          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.circularIconContainer}>
                <Ionicons name="add" size={20} color="#007AFF" />
              </View>
              <Text style={styles.rowLabel}>{isContactSaved ? `Criar grupo com ${partnerName}` : `Criar grupo com ~${profileName || 'Isaura'}`}</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <View style={styles.rowLeft}>
              <View style={styles.circularIconContainer}>
                <Ionicons name="people" size={20} color="#007AFF" />
              </View>
              <Text style={styles.rowLabel}>Adicionar a um grupo</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Block 5: Contact Lists & Clear */}
        <View style={styles.blockCard}>
          {isContactSaved && (
            <>
              <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
                <Text style={[styles.actionLabel, { color: '#007AFF' }]}>Partilhar contacto</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
            </>
          )}

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <Text style={[styles.actionLabel, { color: '#007AFF' }]}>Adicionar aos Favoritos</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <Text style={[styles.actionLabel, { color: '#007AFF' }]}>Adicionar à lista</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/*<TouchableOpacity style={styles.rowItem} activeOpacity={0.7}>
            <Text style={[styles.actionLabel, { color: '#34C759' }]}>Exportar conversa</Text>
          </TouchableOpacity>

          <View style={styles.divider} />*/}

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={handleClearChat}>
            <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Limpar conversa</Text>
          </TouchableOpacity>
        </View>

        {/* Block 6: Block & Report */}
        <View style={styles.blockCard}>
          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={handleBlockContact}>
            <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Bloquear {isContactSaved ? partnerName : partnerPhone}</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity style={styles.rowItem} activeOpacity={0.7} onPress={handleReportContact}>
            <Text style={[styles.actionLabel, { color: '#FF3B30' }]}>Denunciar {isContactSaved ? partnerName : partnerPhone}</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: insets.bottom + 30 }} />
      </ScrollView>

      {/* WhatsApp/Telegram Style Full Screen Profile Image Viewer Modal */}
      <Modal
        visible={isImageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsImageViewerVisible(false)}
      >
        <View style={styles.imageViewerContainer}>
          <StatusBar barStyle="light-content" backgroundColor="#000" />
          
          {/* Viewer Header */}
          <View style={[styles.imageViewerHeader, { paddingTop: insets.top }]}>
            <TouchableOpacity 
              onPress={() => setIsImageViewerVisible(false)} 
              style={styles.closeButton}
            >
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.imageViewerTitle}>{partnerName}</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Full Screen Image */}
          <View style={styles.fullscreenImageContainer}>
            {avatarImage ? (
              <Image 
                source={{ uri: avatarImage }} 
                style={styles.fullscreenImage} 
                contentFit="contain" 
              />
            ) : (
              <View style={styles.fullscreenPlaceholder}>
                <Ionicons name="person" size={120} color="#FFF" />
                <Text style={{ color: '#FFF', marginTop: 15, fontSize: 16 }}>Sem foto de perfil</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    height: 56,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E0E0E0',
  },
  headerButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
  },
  headerRightButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  headerRightText: {
    color: '#007AFF',
    fontSize: 17,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  profileHeaderContainer: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 20,
  },
  avatarWrapper: {
    marginBottom: 16,
  },
  bigAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
  },
  avatarPlaceholder: {
    backgroundColor: '#E5E5EA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    gap: 12,
    marginBottom: 20,
  },
  quickActionButton: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  quickActionText: {
    fontSize: 13,
    color: '#000',
    marginTop: 6,
  },
  createContactText: {
    fontSize: 17,
    color: '#34C759',
    textAlign: 'center',
    width: '100%',
  },
  blockCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  singleRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  circularIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowLabel: {
    fontSize: 16,
    color: '#000',
  },
  rowDesc: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowValue: {
    fontSize: 15,
    color: '#8E8E93',
    marginRight: 6,
  },
  divider: {
    height: 0.5,
    backgroundColor: '#E5E5EA',
    marginLeft: 52,
  },
  sectionHeader: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sectionHeaderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
  actionLabel: {
    fontSize: 16,
  },
  imageViewerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 56,
    backgroundColor: 'rgba(0,0,0,0.6)',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  closeButton: {
    padding: 4,
  },
  imageViewerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
    flex: 1,
  },
  fullscreenImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  fullscreenPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
