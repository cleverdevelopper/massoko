import React from 'react';
import { useRouter } from 'expo-router';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

const STORIES = [
  { id: '1', name: 'Terry', image: 'https://i.pravatar.cc/150?u=terry' },
  { id: '2', name: 'Craig', image: 'https://i.pravatar.cc/150?u=craig' },
  { id: '3', name: 'Roger', image: 'https://i.pravatar.cc/150?u=roger' },
  { id: '4', name: 'Nolan', image: 'https://i.pravatar.cc/150?u=nolan' },
  { id: '5', name: 'Sarah', image: 'https://i.pravatar.cc/150?u=sarah' },
];

const CHATS = [
  {
    id: '1',
    name: 'Angel Curtis',
    message: 'Please help me find a good monitor for t...',
    time: '02:11',
    unread: 2,
    image: 'https://i.pravatar.cc/150?u=angel',
  },
  {
    id: '2',
    name: 'Zaire Dorwart',
    message: 'Gacor pisan kang',
    time: '02:11',
    unread: 0,
    status: 'read',
    image: 'https://i.pravatar.cc/150?u=zaire',
  },
  {
    id: '3',
    name: 'Kelas Malam',
    message: 'Bima : No one can come today?',
    time: '02:11',
    unread: 2,
    image: 'https://i.pravatar.cc/150?u=kelas',
  },
  {
    id: '4',
    name: 'Jocelyn Gouse',
    message: 'You’re now an admin',
    time: '02:11',
    unread: 0,
    image: 'https://i.pravatar.cc/150?u=jocelyn',
  },
  {
    id: '5',
    name: 'Jaylon Dias',
    message: 'Buy back 10k gallons, top up credit, b...',
    time: '02:11',
    unread: 0,
    image: 'https://i.pravatar.cc/150?u=jaylon',
  },
  {
    id: '6',
    name: 'Chance Rhiel Madsen',
    message: 'Thank you mate!',
    time: '02:11',
    unread: 2,
    image: 'https://i.pravatar.cc/150?u=chance',
  },
  {
    id: '7',
    name: 'Livia Dias',
    message: 'Sounds good!',
    time: '02:11',
    unread: 0,
    image: 'https://i.pravatar.cc/150?u=livia',
  },
];

export default function ChatsScreen() {
  const router = useRouter();
  const renderStory = ({ item }: { item: typeof STORIES[0] }) => (
    <View style={styles.storyContainer}>
      <View style={styles.storyRing}>
        <Image source={{ uri: item.image }} style={styles.storyAvatar} />
      </View>
      <Text style={styles.storyName}>{item.name}</Text>
    </View>
  );

  const renderChatItem = ({ item }: { item: typeof CHATS[0] }) => (
    <TouchableOpacity 
      style={styles.chatItem} 
      activeOpacity={0.7}
      onPress={() => router.push({
        pathname: `/chat/${item.id}`,
        params: { name: item.name, image: item.image }
      })}
    >
      <Image source={{ uri: item.image }} style={styles.chatAvatar} />
      <View style={styles.chatInfo}>
        <View style={styles.chatHeader}>
          <Text style={styles.chatName}>{item.name}</Text>
          <Text style={styles.chatTime}>{item.time}</Text>
        </View>
        <View style={styles.chatFooter}>
          <Text style={styles.chatMessage} numberOfLines={1}>
            {item.status === 'read' && <Ionicons name="checkmark-done" size={16} color="#4CD964" style={{marginRight: 4}} />}
            {item.message}
          </Text>
          {item.unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>{item.unread}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Conversas</Text>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="search" size={24} color="#000" />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Stories Section */}
        <View style={styles.storiesWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesContent}>
            <View style={styles.storyContainer}>
              <TouchableOpacity style={styles.addStoryButton}>
                <Ionicons name="add" size={30} color="#000" />
              </TouchableOpacity>
              <Text style={styles.storyName}>Adicionar story</Text>
            </View>
            {STORIES.map((story) => (
              <View key={story.id} style={styles.storyContainer}>
                <View style={styles.storyRing}>
                  <Image source={{ uri: story.image }} style={styles.storyAvatar} />
                </View>
                <Text style={styles.storyName}>{story.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Chats Section */}
        <View style={styles.chatsWrapper}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Conversas</Text>
            <TouchableOpacity>
              <Ionicons name="ellipsis-horizontal" size={20} color="#000" />
            </TouchableOpacity>
          </View>
          
          {CHATS.map((chat) => (
            <View key={chat.id}>
              {renderChatItem({ item: chat })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Floating Action Button for Calls */}
      <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
        <View style={styles.fabContent}>
          <Ionicons name="call" size={24} color="#FFF" />
          <Ionicons name="add" size={14} color="#FFF" style={styles.fabAddIcon} />
        </View>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    height: 60,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  storiesWrapper: {
    paddingVertical: 10,
  },
  storiesContent: {
    paddingHorizontal: 15,
  },
  storyContainer: {
    alignItems: 'center',
    marginHorizontal: 8,
    width: 70,
  },
  storyRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    padding: 2,
    marginBottom: 8,
  },
  storyAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 31,
  },
  addStoryButton: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 1.5,
    borderColor: '#E8E8E8',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  storyName: {
    fontSize: 13,
    color: '#000',
    textAlign: 'center',
  },
  chatsWrapper: {
    flex: 1,
    paddingTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  chatAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  chatInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  chatTime: {
    fontSize: 14,
    color: '#8E8E93',
  },
  chatFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatMessage: {
    fontSize: 15,
    color: '#8E8E93',
    flex: 1,
    marginRight: 10,
  },
  unreadBadge: {
    backgroundColor: '#FFD700', // Yellow/Gold
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabAddIcon: {
    position: 'absolute',
    top: -4,
    right: -6,
  },
});
