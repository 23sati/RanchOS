import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { completeMobileTask, fetchMobileTasks, MobileTaskRecord, parseBlockNames, parsePhotoList } from '../../lib/tasks';

export default function CompleteTaskFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [task, setTask] = useState<MobileTaskRecord | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [gpsData, setGpsData] = useState<{ latitude: number; longitude: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturingGps, setCapturingGps] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadTask = async () => {
      try {
        const tasks = await fetchMobileTasks();
        if (cancelled) return;

        const selectedTask = tasks.find((entry) => entry.id === params.id) ?? null;
        if (!selectedTask) {
          setErrorMessage('Task not found.');
        } else {
          setTask(selectedTask);
          setCompletionNotes(selectedTask.completion_notes ?? '');
          const existingPhotos = parsePhotoList(selectedTask.completion_photo_urls);
          setPhotoUri(existingPhotos[0] ?? null);
          if (
            typeof selectedTask.completion_gps_lat === 'number' &&
            typeof selectedTask.completion_gps_lng === 'number'
          ) {
            setGpsData({
              latitude: selectedTask.completion_gps_lat,
              longitude: selectedTask.completion_gps_lng,
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : 'Unable to load task.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadTask();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const blockNames = useMemo(() => parseBlockNames(task?.block_names_es), [task?.block_names_es]);

  const capturePhotoAndGps = async () => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (cameraPermission.status !== 'granted') {
        Alert.alert('Camera permission needed', 'Camera access is required to attach proof of completion.');
        return;
      }

      const image = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.6,
      });

      if (image.canceled || !image.assets[0]?.uri) {
        return;
      }

      setPhotoUri(image.assets[0].uri);

      const locationPermission = await Location.requestForegroundPermissionsAsync();
      if (locationPermission.status !== 'granted') {
        Alert.alert('GPS permission needed', 'GPS access is required to verify the completion location.');
        return;
      }

      setCapturingGps(true);
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setGpsData({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    } catch (error) {
      Alert.alert('Capture failed', error instanceof Error ? error.message : 'Unable to capture proof.');
    } finally {
      setCapturingGps(false);
    }
  };

  const submitCompletion = async () => {
    if (!task) return;
    if (!photoUri) {
      Alert.alert('Photo required', 'Take a completion photo before submitting.');
      return;
    }
    if (!gpsData) {
      Alert.alert('GPS required', 'Capture GPS before submitting completion.');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      const completedTask = await completeMobileTask(task, {
        completionNotes,
        photoUri,
        gpsLat: gpsData.latitude,
        gpsLng: gpsData.longitude,
      });

      setTask(completedTask);
      Alert.alert('Task completed', 'The task was marked complete and synced to the server.');
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to complete task.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centeredState}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.stateText}>Loading task...</Text>
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.centeredState}>
        <Text style={styles.errorText}>{errorMessage || 'Task not found.'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Complete Task</Text>
      <Text style={styles.title}>{task.title}</Text>
      <Text style={styles.metaText}>{blockNames.length > 0 ? blockNames.join(', ') : 'No block assignment'}</Text>
      {task.description ? <Text style={styles.description}>{task.description}</Text> : null}

      {task.has_organic_block ? (
        <View style={styles.organicWarning}>
          <Text style={styles.organicText}>Organic block assignment: keep notes and field proof precise.</Text>
        </View>
      ) : null}

      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Capture photo + GPS</Text>
        {!photoUri ? (
          <TouchableOpacity style={styles.captureButton} onPress={() => void capturePhotoAndGps()}>
            <Text style={styles.buttonText}>Open Camera</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.captureSummary}>
            <Image source={{ uri: photoUri }} style={styles.previewImage} />
            <View style={styles.summaryTextWrap}>
              <Text style={styles.summaryHeadline}>Photo captured</Text>
              {capturingGps ? (
                <View style={styles.gpsLoadingRow}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.summaryText}>Verifying GPS...</Text>
                </View>
              ) : gpsData ? (
                <Text style={styles.summaryText}>
                  GPS {gpsData.latitude.toFixed(4)}, {gpsData.longitude.toFixed(4)}
                </Text>
              ) : (
                <Text style={styles.summaryText}>GPS still missing</Text>
              )}
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. Completion notes</Text>
        <TextInput
          multiline
          numberOfLines={4}
          value={completionNotes}
          onChangeText={setCompletionNotes}
          placeholder="What was completed, what you saw in the field, and anything to follow up."
          style={styles.notesInput}
          textAlignVertical="top"
        />
      </View>

      <TouchableOpacity
        style={[styles.submitButton, (!photoUri || !gpsData || submitting) && styles.submitButtonDisabled]}
        onPress={() => void submitCompletion()}
        disabled={!photoUri || !gpsData || submitting}
      >
        <Text style={styles.buttonText}>{submitting ? 'Submitting...' : 'Confirm Completion'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, gap: 20, paddingBottom: 40 },
  centeredState: { flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 12 },
  stateText: { color: '#6B7280', fontSize: 15 },
  header: { fontSize: 24, fontWeight: '700', color: '#111827', marginTop: 40 },
  title: { fontSize: 22, fontWeight: '600', color: '#111827' },
  metaText: { fontSize: 14, color: '#6B7280' },
  description: { fontSize: 15, color: '#4B5563', lineHeight: 22 },
  organicWarning: {
    backgroundColor: '#ECFCCB',
    borderColor: '#84CC16',
    borderWidth: 1,
    padding: 16,
    borderRadius: 8,
  },
  organicText: { color: '#4D7C0F', fontWeight: '700' },
  errorText: { color: '#B91C1C', fontSize: 14 },
  section: { gap: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  captureButton: { backgroundColor: '#2563EB', padding: 16, borderRadius: 8, alignItems: 'center' },
  captureSummary: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  previewImage: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#D1D5DB' },
  summaryTextWrap: { flex: 1, gap: 6 },
  summaryHeadline: { fontSize: 15, fontWeight: '700', color: '#111827' },
  summaryText: { fontSize: 13, color: '#4B5563' },
  gpsLoadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notesInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#F9FAFB',
  },
  submitButton: { backgroundColor: '#10B981', padding: 16, borderRadius: 8, alignItems: 'center' },
  submitButtonDisabled: { opacity: 0.5 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
