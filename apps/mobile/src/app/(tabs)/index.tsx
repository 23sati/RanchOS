import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { registerDevicePushToken } from '../../lib/notifications';
import {
  MobileTaskRecord,
  fetchMobileTasks,
  formatDueDate,
  formatTaskStatusLabel,
  parseBlockNames,
} from '../../lib/tasks';

function statusBadgeColor(status: MobileTaskRecord['status']) {
  if (status === 'completed') return { backgroundColor: '#DCFCE7', color: '#166534' };
  if (status === 'in_progress') return { backgroundColor: '#DBEAFE', color: '#1D4ED8' };
  if (status === 'overdue') return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
  return { backgroundColor: '#E5E7EB', color: '#374151' };
}

function priorityBadgeColor(priority: MobileTaskRecord['priority']) {
  if (priority === 'urgent') return { backgroundColor: '#FEE2E2', color: '#B91C1C' };
  if (priority === 'high') return { backgroundColor: '#FEF3C7', color: '#B45309' };
  return { backgroundColor: '#E5E7EB', color: '#4B5563' };
}

export default function CrewTasksFeed() {
  const router = useRouter();
  const [tasks, setTasks] = useState<MobileTaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadTasks = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const nextTasks = await fetchMobileTasks();
      setTasks(nextTasks);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load tasks.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    void registerDevicePushToken();
  }, []);

  const openCount = useMemo(
    () => tasks.filter((task) => task.status === 'pending' || task.status === 'overdue').length,
    [tasks],
  );

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>Loading assigned tasks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.header}>My Tasks</Text>
          <Text style={styles.subtitle}>{openCount} still need attention</Text>
        </View>
        <TouchableOpacity style={styles.scoutButton} onPress={() => router.push('/scout')}>
          <Text style={styles.scoutButtonText}>Scout Block</Text>
        </TouchableOpacity>
      </View>

      {errorMessage ? <Text style={styles.errorBanner}>{errorMessage}</Text> : null}

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadTasks('refresh')} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No assigned tasks yet</Text>
            <Text style={styles.emptyText}>Pull to refresh after tasks are assigned on the web dashboard.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const blockNames = parseBlockNames(item.block_names_es);
          const statusTone = statusBadgeColor(item.status);
          const priorityTone = priorityBadgeColor(item.priority);

          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push({ pathname: '/tasks/complete', params: { id: item.id } })}
            >
              <View style={[styles.colorBar, { backgroundColor: item.task_type_color || '#6B7280' }]} />
              <View style={styles.cardContent}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.dueDate}>Due {formatDueDate(item.due_date)}</Text>
                </View>
                <Text style={styles.typeText}>{item.task_type_name_es || 'Tarea'}</Text>
                <Text style={styles.subtext}>
                  {blockNames.length > 0 ? blockNames.join(', ') : 'No block assignment'}
                </Text>
                {item.description ? <Text style={styles.description}>{item.description}</Text> : null}
                <View style={styles.badgeContainer}>
                  <Text style={[styles.badge, { backgroundColor: statusTone.backgroundColor, color: statusTone.color }]}>
                    {formatTaskStatusLabel(item.status)}
                  </Text>
                  <Text style={[styles.badge, { backgroundColor: priorityTone.backgroundColor, color: priorityTone.color }]}>
                    {item.priority.toUpperCase()}
                  </Text>
                  {item.has_organic_block ? (
                    <Text style={[styles.badge, { backgroundColor: '#DCFCE7', color: '#166534' }]}>ORGANIC</Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6', padding: 16 },
  centeredState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#F3F4F6' },
  stateText: { color: '#6B7280', fontSize: 15 },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 40,
  },
  header: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 4 },
  scoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EA580C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  scoutButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    color: '#B91C1C',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 6 },
  emptyText: { fontSize: 14, color: '#6B7280' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  colorBar: { width: 8 },
  cardContent: { padding: 16, flex: 1, gap: 6 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, fontWeight: '600', color: '#111827', flex: 1 },
  dueDate: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  typeText: { fontSize: 13, color: '#4B5563', fontWeight: '600' },
  subtext: { fontSize: 14, color: '#6B7280' },
  description: { fontSize: 13, color: '#4B5563' },
  badgeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
});
