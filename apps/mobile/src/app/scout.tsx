import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Bug, Camera, MapPin, ChevronRight, AlertTriangle } from 'lucide-react-native';

const RATINGS = [
  { id: 'none', labelEn: 'None', labelEs: 'Ninguno', color: 'bg-green-100', textCol: 'text-green-800' },
  { id: 'low', labelEn: 'Low', labelEs: 'Baja', color: 'bg-emerald-100', textCol: 'text-emerald-800' },
  { id: 'moderate', labelEn: 'Moderate', labelEs: 'Moderada', color: 'bg-yellow-100', textCol: 'text-yellow-800' },
  { id: 'high', labelEn: 'High', labelEs: 'Alta', color: 'bg-orange-100', textCol: 'text-orange-800' },
  { id: 'action', labelEn: 'Action Threshold', labelEs: 'Nivel de Acción', color: 'bg-red-100 border-red-500 border-2', textCol: 'text-red-800 font-bold' },
];

export default function ScoutScreen() {
  const router = useRouter();
  const [gpsReady, setGpsReady] = useState(false);
  const [isOrganic, setIsOrganic] = useState(true); // mocked block context
  const [selectedRating, setSelectedRating] = useState('none');
  const [count, setCount] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
         setGpsReady(true);
      }
    })();
  }, []);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permisos de cámara requeridos.');
    await ImagePicker.launchCameraAsync({ quality: 0.5 });
  };

  const saveLog = async () => {
    // In prod, pushes to WatermelonDB database instance or API directly if online
    Alert.alert('Guardado Exitosamente', 'Reporte guardado en modo Offline. Se sincronizará automáticamente.');
    router.back();
  };

  return (
    <ScrollView className="flex-1 bg-gray-50 p-4">
      <View className="mb-6">
        <Text className="text-sm font-bold text-gray-500 uppercase">Bloque Seleccionado</Text>
        <Text className="text-2xl font-bold text-gray-900">Block A (Almendras)</Text>
        <View className="flex-row items-center mt-2">
           <View className="bg-emerald-100 px-2 py-1 rounded border border-emerald-200">
             <Text className="text-xs font-bold text-emerald-800 uppercase">OMRI Orgánico</Text>
           </View>
        </View>
      </View>

      <View className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-6">
        <View className="flex-row items-center border-b border-gray-100 pb-4 mb-4">
           <View className={`w-8 h-8 rounded-full ${gpsReady ? 'bg-blue-100' : 'bg-gray-200'} items-center justify-center mr-3`}>
             <MapPin size={16} color={gpsReady ? '#2563EB' : '#9CA3AF'} />
           </View>
           <View>
             <Text className="font-bold text-gray-900">Modo de Caminata GPS</Text>
             <Text className="text-xs text-gray-500">{gpsReady ? 'Rastreando ruta a 2m de precisión' : 'Buscando satélites...'}</Text>
           </View>
        </View>

        <Text className="font-bold text-gray-700 mb-2">Seleccionar Plaga</Text>
        <TouchableOpacity className="flex-row items-center justify-between p-4 bg-gray-50 border border-gray-200 rounded-xl mb-4">
           <View className="flex-row items-center">
              <Bug size={20} color="#6B7280" style={{marginRight: 10}}/>
              <Text className="font-semibold text-gray-900">Gusano de la Naranja (NOW)</Text>
           </View>
           <ChevronRight size={20} color="#9CA3AF" />
        </TouchableOpacity>
        
        {isOrganic && (
           <View className="flex-row items-start p-3 bg-amber-50 border border-amber-200 rounded-lg mb-6">
             <AlertTriangle size={18} color="#D97706" style={{marginTop: 2, marginRight: 8}}/>
             <Text className="text-sm text-amber-800 flex-1">Este bloque es orgánico. Algunos tratamientos químicos para esta plaga están restringidos.</Text>
           </View>
        )}

        <Text className="font-bold text-gray-700 mb-2">Nivel de Presión</Text>
        <View className="flex-row flex-wrap gap-2 mb-6">
           {RATINGS.map(r => (
             <TouchableOpacity 
                key={r.id} 
                onPress={() => setSelectedRating(r.id)}
                className={`py-2 px-3 rounded-lg ${r.color} ${selectedRating === r.id ? 'opacity-100 scale-105 shadow-sm' : 'opacity-40'}`}
             >
               <Text className={`${r.textCol}`}>{r.labelEs}</Text>
             </TouchableOpacity>
           ))}
        </View>

        <Text className="font-bold text-gray-700 mb-2">Conteo por Muestra</Text>
        <TextInput 
           keyboardType="numeric" 
           value={count} 
           onChangeText={setCount}
           placeholder="Ej: 14"
           className="bg-gray-50 border border-gray-200 p-4 rounded-xl text-lg font-bold mb-6"
        />

        <Text className="font-bold text-gray-700 mb-2">Evidencia Fotográfica</Text>
        <TouchableOpacity onPress={takePhoto} className="border-2 border-dashed border-gray-300 p-6 rounded-xl items-center justify-center mb-6">
           <Camera size={32} color="#9CA3AF" />
           <Text className="text-gray-500 font-medium mt-2">Tomar Foto</Text>
        </TouchableOpacity>

        <Text className="font-bold text-gray-700 mb-2">Notas Adicionales</Text>
        <TextInput 
           multiline 
           numberOfLines={3} 
           value={notes} 
           onChangeText={setNotes}
           placeholder="Describa el estadio larval, condiciones..."
           className="bg-gray-50 border border-gray-200 p-4 rounded-xl text-sm mb-6 h-24"
           textAlignVertical="top"
        />

        <TouchableOpacity onPress={saveLog} className="bg-blue-600 w-full p-4 rounded-xl items-center shadow-sm">
           <Text className="text-white font-bold text-lg">Guardar Reporte</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
