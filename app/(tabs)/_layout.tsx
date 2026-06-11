import { Tabs } from 'expo-router';
import React from 'react';
import { FloatingSegmentedTabs } from '@/components/FloatingSegmentedTabs';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingSegmentedTabs {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
        }}
      />
      <Tabs.Screen
        name="calls"
        options={{
          title: 'Calls',
        }}
      />
      <Tabs.Screen
        name="stories"
        options={{
          title: 'Stories',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
      <Tabs.Screen name="new-chat-dummy" options={{ href: null }} />
    </Tabs>
  );
}
