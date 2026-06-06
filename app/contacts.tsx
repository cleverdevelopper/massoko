import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SectionList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  StatusBar,
  Modal,
  Switch,
  ScrollView,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { Image } from 'expo-image';
import axiosInstance from '@/utils/axiosInstance';
import { useAuth } from '@/context/AuthContext';
import { COUNTRIES, Country } from '@/constants/countries';
import { signalService } from '@/utils/signal/SignalService';

interface ContactItem {
  id: string;
  name: string;
  phone?: string;
  allPhones?: string[];
  image?: string;
  isRegistered?: boolean;
  surname?: string;
  profile_photo?: string;
  public_key?: string;
}

interface SectionData {
  title: string;
  data: ContactItem[];
  isInvite?: boolean;
}

const normalizePhone = (phone?: string) => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 9 ? cleaned.slice(-9) : cleaned;
};

const getMaxDigits = (pattern: string) => pattern.replace(/[^0]/g, '').length;

export default function ContactsScreen() {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  
  const [deviceContacts, setDeviceContacts] = useState<ContactItem[]>([]);
  const [appContacts, setAppContacts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<boolean | null>(null);
  
  // Modal States
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCountryModalVisible, setIsCountryModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSurname, setNewSurname] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(COUNTRIES[0]); // Moçambique
  const [newPhone, setNewPhone] = useState('');
  const [syncToPhone, setSyncToPhone] = useState(true);
  const [countrySearch, setCountrySearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const loadData = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      
      // 1. Fetch Backend Contacts
      const appResponse = await axiosInstance.get('/api/v1/app/contacts');
      const registeredUsers = appResponse.data?.contacts || [];
      setAppContacts(registeredUsers);

      // 2. Fetch Device Contacts
      const { status } = await Contacts.requestPermissionsAsync();
      setPermission(status === 'granted');
      
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Image],
        });

        if (data && data.length > 0) {
          const formatted = data
            .map(contact => ({
              id: contact.id || Math.random().toString(),
              name: contact.name || 'Sem nome',
              phone: contact.phoneNumbers?.[0]?.number,
              allPhones: contact.phoneNumbers?.map(p => p.number || '').filter(p => p !== '') || [],
              image: contact.imageAvailable && contact.image ? contact.image.uri : undefined,
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
          setDeviceContacts(formatted);
        }
      }
    } catch (error: any) {
      console.error('Error loading contacts:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groupedSections = useMemo(() => {
    const onMassoko: ContactItem[] = [];
    const notOnMassoko: ContactItem[] = [...deviceContacts];

    appContacts.forEach(registeredUser => {
      const normalized = normalizePhone(registeredUser.phone_number);
      const isMe = currentUser && normalizePhone(currentUser.phone_number) === normalized;
      
      const deviceMatchIndex = notOnMassoko.findIndex(dc => 
        dc.allPhones?.some(p => normalizePhone(p) === normalized)
      );

      if (deviceMatchIndex !== -1 || isMe) {
        let deviceContact = deviceMatchIndex !== -1 ? notOnMassoko[deviceMatchIndex] : null;
        let finalName = deviceContact ? deviceContact.name : `${registeredUser.name} ${registeredUser.surname || ''}`.trim();
        if (isMe) finalName = `${finalName} (Voce)`;

        onMassoko.push({
          id: registeredUser.id.toString(),
          name: finalName,
          surname: '', 
          phone: registeredUser.phone_number,
          image: registeredUser.profile_photo || deviceContact?.image,
          isRegistered: true,
          public_key: registeredUser.public_key,
          allPhones: deviceContact?.allPhones || [registeredUser.phone_number]
        });

        if (deviceMatchIndex !== -1) notOnMassoko.splice(deviceMatchIndex, 1);
      }
    });

    const filteredMassoko = search 
      ? onMassoko.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.phone?.includes(search)) 
      : onMassoko;
    
    const filteredInvite = search 
      ? notOnMassoko.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone && c.phone.includes(search))) 
      : notOnMassoko;

    const groups: { [key: string]: ContactItem[] } = {};
    filteredMassoko.forEach(contact => {
      const firstLetter = contact.name[0]?.toUpperCase() || '#';
      const key = /[A-Z]/.test(firstLetter) ? firstLetter : '#';
      if (!groups[key]) groups[key] = [];
      groups[key].push(contact);
    });

    const massokoSections: SectionData[] = Object.keys(groups)
      .sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b)))
      .map(key => ({ title: key, data: groups[key] }));

    if (filteredInvite.length > 0) {
      massokoSections.push({ title: 'Convidar para o Massoko', data: filteredInvite, isInvite: true });
    }

    return massokoSections;
  }, [deviceContacts, appContacts, search, currentUser]);

  const handleSaveContact = async () => {
    const fullPhone = `${selectedCountry.code}${newPhone}`;
    const requiredDigits = getMaxDigits(selectedCountry.pattern);
    if (!newName || !newPhone || newPhone.length !== requiredDigits) return;

    setIsSaving(true);
    try {
      if (syncToPhone) {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          const contact = {
            [Contacts.Fields.FirstName]: newName,
            [Contacts.Fields.LastName]: newSurname,
            [Contacts.Fields.PhoneNumbers]: [{ label: 'mobile', number: fullPhone }],
          };
          
          await Contacts.addContactAsync(contact as any);
          
          Alert.alert('Sucesso', 'Contacto guardado na sua agenda telefónica.');
        } else {
          Alert.alert('Erro', 'Permissão negada para guardar contactos.');
        }
      } else {
        Alert.alert('Aviso', 'O contacto não foi guardado na agenda local (sincronização desligada).');
      }
      
      setIsModalVisible(false);
      setNewName(''); setNewSurname(''); setNewPhone('');
      
      // Refresh the list to show the new contact
      loadData(false); 
    } catch (error) {
      console.error('Error saving contact:', error);
      Alert.alert('Erro', 'Não foi possível guardar o contacto.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredCountries = useMemo(() => {
    return COUNTRIES.filter(c => 
      c.name.toLowerCase().includes(countrySearch.toLowerCase()) || 
      c.code.includes(countrySearch)
    );
  }, [countrySearch]);

  const handleStartChat = async (contact: ContactItem) => {
    console.log('[Contacts] handleStartChat called with:', { id: contact.id, name: contact.name, isRegistered: contact.isRegistered, public_key: contact.public_key });

    if (!contact.isRegistered) {
      Alert.alert(
        'Convidar para o Massoko',
        `${contact.name} ainda não está no Massoko. Deseja enviar um convite?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Convidar', onPress: () => console.log('Invite pressed') }
        ]
      );
      return;
    }

    try {
      setStartingChat(true);

      // Only try to build Signal session if contact has a public key
      try {
        await signalService.buildSessionIfNeeded(contact.id);
        console.log('[Contacts] Signal session built successfully for:', contact.id);
      } catch (sessionError) {
        console.warn('[Contacts] Failed to pre-build session (continuing anyway):', sessionError);
      }

      console.log('[Contacts] Creating/fetching conversation with user_id:', contact.id);
      const response = await axiosInstance.post('/api/v1/conversations/private', {
        user_id: contact.id
      });
      console.log('[Contacts] API response:', JSON.stringify(response.data));

      if (response.data?.conversation_id) {
        console.log('[Contacts] Navigating to chat:', response.data.conversation_id);
        router.push({
          pathname: '/chat/[id]',
          params: {
            id: String(response.data.conversation_id),
            name: contact.name,
            image: contact.image || '',
            partnerId: contact.id,
            phone: contact.phone || '',
            profileName: contact.name
          }
        });
      } else {
        console.error('[Contacts] No conversation_id in response:', response.data);
        Alert.alert('Erro', 'O servidor não retornou um ID de conversa.');
      }
    } catch (error: any) {
      console.error('[Contacts] Error starting chat:', error?.response?.status, error?.response?.data || error?.message);
      Alert.alert('Erro', `Não foi possível iniciar a conversa: ${error?.response?.data?.message || error?.message || 'Erro desconhecido'}`);
    } finally {
      setStartingChat(false);
    }
  };

  const renderContactItem = ({ item, index, section }: { item: ContactItem, index: number, section: SectionData }) => {
    const isFirst = index === 0;
    const isLast = index === section.data.length - 1;
    return (
      <TouchableOpacity 
        style={[styles.contactItem, isFirst && styles.firstItem, isLast && styles.lastItem, isLast && styles.groupShadow]} 
        activeOpacity={0.7}
        onPress={() => handleStartChat(item)}
      >
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Ionicons name="person" size={20} color="#8E8E93" />
          </View>
        )}
        <View style={[styles.contactInfo, !isLast && styles.borderBottom]}>
          <View style={styles.contactMain}>
            <Text style={styles.contactName} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.contactPhone} numberOfLines={1}>{item.phone || 'Sem número'}</Text>
          </View>
          {section.isInvite && (
            <TouchableOpacity style={styles.inviteButton}>
              <Text style={styles.inviteText}>Convidar</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section: { title } }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );

  const maxDigits = getMaxDigits(selectedCountry.pattern);
  const isValid = newName && newPhone && newPhone.length === maxDigits;

  if (loading) return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#000" />
      <Text style={styles.loadingText}>Sincronizando contactos...</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerMainTitle}>Contactos</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.contactCount}>{deviceContacts.length} contactos</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Procurar..."
            value={search}
            onChangeText={setSearch}
            placeholderTextColor="#8E8E93"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <SectionList
        sections={groupedSections}
        keyExtractor={(item, index) => (item.id || index.toString()) + index}
        renderItem={renderContactItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeaderActions}>
            <View style={styles.actionsCard}>
              <TouchableOpacity 
                style={styles.actionItemSingle} 
                activeOpacity={0.6}
                onPress={() => setIsModalVisible(true)}
              >
                <View style={[styles.actionIconContainer, { backgroundColor: '#007AFF15' }]}>
                  <Ionicons name="person-add" size={20} color="#007AFF" />
                </View>
                <Text style={styles.actionText}>Novo contacto</Text>
                <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
              </TouchableOpacity>
              
              <View style={styles.actionDivider} />

              <TouchableOpacity style={styles.actionItemSingle} activeOpacity={0.6}>
                <View style={[styles.actionIconContainer, { backgroundColor: '#34C75915' }]}>
                  <Ionicons name="people" size={20} color="#34C759" />
                </View>
                <Text style={styles.actionText}>Novo grupo</Text>
                <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
              </TouchableOpacity>
            </View>

            <View style={styles.headerDivider}>
              <Text style={styles.dividerText}>Contactos no Massoko</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nenhum contacto encontrado.</Text>
          </View>
        }
      />

      {/* Novo Contacto Modal */}
      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setIsModalVisible(false)}>
              <Text style={styles.modalCancel}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Novo Contacto</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.modalScroll} bounces={true} contentContainerStyle={{ paddingBottom: 40 }}>
            <View style={styles.modalFormContainer}>
              
              {/* Card de Nome */}
              <View style={styles.modalCard}>
                <View style={styles.inputItem}>
                  <Ionicons name="person-outline" size={20} color="#8E8E93" style={styles.inputIcon} />
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Nome"
                    value={newName}
                    onChangeText={setNewName}
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.inputItem}>
                  <View style={{ width: 20, marginRight: 12 }} /> 
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Apelido (Opcional)"
                    value={newSurname}
                    onChangeText={setNewSurname}
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>

              {/* Card de País */}
              <TouchableOpacity 
                style={styles.modalCard} 
                activeOpacity={0.7}
                onPress={() => setIsCountryModalVisible(true)}
              >
                <View style={styles.inputItem}>
                  <Ionicons name="globe-outline" size={20} color="#8E8E93" style={styles.inputIcon} />
                  <View style={styles.countrySelectorContent}>
                    <Text style={styles.countrySelectorLabel}>País / Região</Text>
                    <Text style={styles.countrySelectorValue}>{selectedCountry.flag} {selectedCountry.name} ({selectedCountry.code})</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#C7C7CC" />
                </View>
              </TouchableOpacity>

              {/* Card de Telefone */}
              <View style={styles.modalCard}>
                <View style={styles.inputItem}>
                  <Ionicons name="call-outline" size={20} color="#8E8E93" style={styles.inputIcon} />
                  <TextInput
                    style={styles.modalInput}
                    placeholder={selectedCountry.pattern.replace(/0/g, 'X')}
                    value={newPhone}
                    onChangeText={setNewPhone}
                    keyboardType="phone-pad"
                    maxLength={maxDigits}
                    placeholderTextColor="#C7C7CC"
                  />
                </View>
              </View>

              {/* Card de Sincronização */}
              <View style={[styles.modalCard, styles.syncRow]}>
                <View style={styles.syncInfo}>
                  <Text style={styles.syncTitle}>Sincronizar com telemóvel</Text>
                  <Text style={styles.syncDesc}>Guardar na sua agenda local.</Text>
                </View>
                <Switch
                  value={syncToPhone}
                  onValueChange={setSyncToPhone}
                  trackColor={{ false: '#D1D1D6', true: '#000000' }}
                />
              </View>

              {/* Botão Criar Contacto */}
              <TouchableOpacity 
                style={[styles.createButton, (!isValid || isSaving) && styles.createButtonDisabled]}
                onPress={handleSaveContact}
                disabled={!isValid || isSaving}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.createButtonText}>Criar contacto</Text>
                )}
              </TouchableOpacity>

            </View>
          </ScrollView>
        </View>

        {/* Modal de Seleção de País */}
        <Modal
          visible={isCountryModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setIsCountryModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setIsCountryModalVisible(false)}>
                <Text style={styles.modalCancel}>Fechar</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Selecione o País</Text>
              <View style={{ width: 60 }} />
            </View>

            <View style={styles.modalSearchContainer}>
              <Ionicons name="search" size={18} color="#8E8E93" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar país ou código..."
                value={countrySearch}
                onChangeText={setCountrySearch}
                placeholderTextColor="#8E8E93"
              />
            </View>

            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code + item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.countryItem}
                  onPress={() => {
                    setSelectedCountry(item);
                    setNewPhone(''); 
                    setIsCountryModalVisible(false);
                    setCountrySearch('');
                  }}
                >
                  <View style={styles.countryItemLeft}>
                    <Text style={styles.countryItemFlag}>{item.flag}</Text>
                    <Text style={styles.countryItemName}>{item.name}</Text>
                  </View>
                  <Text style={styles.countryItemCode}>{item.code}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.cardDivider} />}
            />
          </View>
        </Modal>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFF' },
  loadingText: { marginTop: 15, fontSize: 14, color: '#8E8E93' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingVertical: 10 },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  headerMainTitle: { fontSize: 24, fontWeight: '800', color: '#000', marginLeft: 8, letterSpacing: -0.5 },
  headerRight: { justifyContent: 'center' },
  contactCount: { fontSize: 13, color: '#8E8E93', fontWeight: '500' },
  headerButton: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  searchContainer: { paddingHorizontal: 20, paddingBottom: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3E3E8', borderRadius: 12, paddingHorizontal: 12, height: 40 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: '#000' },
  listContent: { paddingHorizontal: 16, paddingBottom: 30 },
  listHeaderActions: { paddingBottom: 10 },
  actionsCard: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  actionItemSingle: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  actionIconContainer: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  actionText: { flex: 1, fontSize: 17, fontWeight: '500', color: '#000' },
  actionDivider: { height: 0.5, backgroundColor: '#F2F2F7', marginLeft: 67 },
  headerDivider: { paddingTop: 20, paddingBottom: 8, paddingLeft: 4 },
  dividerText: { fontSize: 13, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase' },
  sectionHeader: { paddingLeft: 10, paddingTop: 15, paddingBottom: 8 },
  sectionTitleText: { fontSize: 14, fontWeight: '700', color: '#8E8E93' },
  contactItem: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', backgroundColor: '#FFF' },
  firstItem: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  lastItem: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  groupShadow: { marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 1 },
  avatar: { width: 42, height: 42, borderRadius: 21, marginRight: 12 },
  avatarPlaceholder: { backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center' },
  contactInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 50 },
  contactMain: { flex: 1, justifyContent: 'center' },
  borderBottom: { borderBottomWidth: 0.5, borderBottomColor: '#F2F2F7' },
  contactName: { fontSize: 16, fontWeight: '600', color: '#000' },
  contactPhone: { fontSize: 13, color: '#8E8E93' },
  inviteButton: { paddingHorizontal: 12, paddingVertical: 6 },
  inviteText: { color: '#007AFF', fontSize: 14, fontWeight: '600' },
  emptyContainer: { paddingTop: 100, alignItems: 'center' },
  emptyText: { fontSize: 16, color: '#8E8E93' },
  // Modal Style Upgraded
  modalContent: { flex: 1, backgroundColor: '#F2F2F7' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, height: 56, backgroundColor: '#FFF', borderBottomWidth: 0.5, borderBottomColor: '#C6C6C8' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#000' },
  modalCancel: { fontSize: 17, color: '#007AFF' },
  modalSave: { fontSize: 17, fontWeight: '600', color: '#007AFF' },
  disabledText: { opacity: 0.3 },
  modalScroll: { flex: 1 },
  modalFormContainer: { paddingHorizontal: 16, paddingTop: 24 },
  modalCard: { backgroundColor: '#FFF', borderRadius: 14, marginBottom: 16, overflow: 'hidden' },
  inputItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50 },
  inputIcon: { marginRight: 12 },
  modalInput: { fontSize: 17, color: '#000', flex: 1 },
  cardDivider: { height: 0.5, backgroundColor: '#F2F2F7', marginLeft: 48 },
  countrySelectorContent: { flex: 1 },
  countrySelectorLabel: { fontSize: 12, color: '#8E8E93', marginBottom: 2 },
  countrySelectorValue: { fontSize: 17, color: '#000' },
  syncRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  syncInfo: { flex: 1 },
  syncTitle: { fontSize: 17, color: '#000' },
  syncDesc: { fontSize: 13, color: '#8E8E93' },
  modalSearchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E3E3E8', borderRadius: 10, paddingHorizontal: 12, height: 36, margin: 16 },
  countryItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF' },
  countryItemLeft: { flexDirection: 'row', alignItems: 'center' },
  countryItemFlag: { fontSize: 24, marginRight: 12 },
  countryItemName: { fontSize: 17, color: '#000' },
  countryItemCode: { fontSize: 17, color: '#8E8E93' },
  createButton: { backgroundColor: '#000', borderRadius: 14, height: 56, justifyContent: 'center', alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  createButtonDisabled: { backgroundColor: '#C7C7CC', shadowOpacity: 0, elevation: 0 },
  createButtonText: { color: '#FFF', fontSize: 17, fontWeight: '700' },
});
