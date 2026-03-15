import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  Alert,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { adminService } from '../../services/admin.service';
import { useAuth } from '../../hooks/useAuth';
import type { User } from '../../types';

export function UserManagementScreen() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  // Create user form
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await adminService.getUsers(1, 100);
      setUsers(res.data);
    } catch {
      // silent
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchUsers();
    }, [fetchUsers]),
  );

  const handleApprove = async (user: User) => {
    try {
      await adminService.updateUser(user.id, { isApproved: true });
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isApproved: true } : u)),
      );
    } catch {
      Alert.alert('Ошибка', 'Не удалось подтвердить');
    }
  };

  const handlePromoteToAdmin = (user: User) => {
    setEditTarget(null);
    Alert.alert(
      'Назначить администратором?',
      `${user.fullName} получит права администратора. Это действие нельзя отменить через приложение.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Назначить',
          onPress: async () => {
            try {
              await adminService.updateUser(user.id, { role: 'admin' });
              setUsers((prev) =>
                prev.map((u) => (u.id === user.id ? { ...u, role: 'admin' } : u)),
              );
            } catch {
              Alert.alert('Ошибка', 'Не удалось изменить роль');
            }
          },
        },
      ],
    );
  };

  const handleDelete = (user: User) => {
    setEditTarget(null);
    Alert.alert('Удалить пользователя?', user.fullName, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await adminService.deleteUser(user.id);
            setUsers((prev) => prev.filter((u) => u.id !== user.id));
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить');
          }
        },
      },
    ]);
  };

  const handleCreate = async () => {
    if (!fullName.trim() || !phone.trim() || !email.trim() || !password) {
      Alert.alert('Ошибка', 'Заполните все поля');
      return;
    }
    setCreating(true);
    try {
      const user = await adminService.createUser({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        password,
      });
      setUsers((prev) => [user, ...prev]);
      setShowCreateModal(false);
      resetForm();
    } catch (err: any) {
      Alert.alert('Ошибка', err?.response?.data?.message || 'Не удалось создать');
    } finally {
      setCreating(false);
    }
  };

  const resetForm = () => {
    setFullName('');
    setPhone('');
    setEmail('');
    setPassword('');
  };

  const canEdit = (item: User) =>
    item.role !== 'admin' || item.id !== currentUser?.id;

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userCard}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.fullName}</Text>
        <Text style={styles.userMeta}>
          {item.role === 'admin' ? 'Админ' : 'Оператор'} ·{' '}
          {item.isApproved ? 'Активен' : 'Ожидает'}
        </Text>
        <Text style={styles.userContact}>{item.phone}</Text>
      </View>
      <View style={styles.userActions}>
        {!item.isApproved && (
          <TouchableOpacity
            style={styles.approveBtn}
            onPress={() => handleApprove(item)}
          >
            <Text style={styles.approveBtnText}>✓</Text>
          </TouchableOpacity>
        )}
        {canEdit(item) && (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => setEditTarget(item)}
          >
            <Text style={styles.editBtnText}>✎</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchUsers();
            }}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Нет пользователей</Text>
        }
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowCreateModal(true)}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Edit actions modal */}
      <Modal visible={!!editTarget} animationType="fade" transparent>
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setEditTarget(null)}
        >
          <View style={styles.modal} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>{editTarget?.fullName}</Text>
            <Text style={styles.modalSubtitle}>
              {editTarget?.role === 'admin' ? 'Админ' : 'Оператор'} ·{' '}
              {editTarget?.phone}
            </Text>

            {editTarget?.role !== 'admin' && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => editTarget && handlePromoteToAdmin(editTarget)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#FFF8E1' }]}>
                  <Text style={{ fontSize: 16 }}>★</Text>
                </View>
                <Text style={styles.actionText}>Назначить администратором</Text>
              </TouchableOpacity>
            )}

            {editTarget?.id !== currentUser?.id && editTarget?.role !== 'admin' && (
              <TouchableOpacity
                style={styles.actionRow}
                onPress={() => editTarget && handleDelete(editTarget)}
              >
                <View style={[styles.actionIcon, { backgroundColor: '#FFEBEE' }]}>
                  <Text style={{ fontSize: 16, color: '#E53935' }}>✕</Text>
                </View>
                <Text style={[styles.actionText, { color: '#E53935' }]}>
                  Удалить пользователя
                </Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionRow, { marginTop: 8 }]}
              onPress={() => setEditTarget(null)}
            >
              <Text style={[styles.actionText, { color: '#999', textAlign: 'center', flex: 1 }]}>
                Отмена
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Create user modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay} pointerEvents="box-none">
              <View style={styles.modal}>
                <Text style={styles.modalTitle}>Новый пользователь</Text>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Input label="ФИО" value={fullName} onChangeText={setFullName} />
                  <Input label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                  <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
                  <Input label="Пароль" value={password} onChangeText={setPassword} secureTextEntry />
                  <Button title="Создать" onPress={handleCreate} loading={creating} />
                  <Button
                    title="Отмена"
                    onPress={() => {
                      setShowCreateModal(false);
                      resetForm();
                    }}
                    variant="secondary"
                    style={{ marginTop: 8 }}
                  />
                </ScrollView>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  userCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  userMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  userContact: {
    fontSize: 12,
    color: '#aaa',
    marginTop: 2,
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  approveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    color: '#43A047',
    fontSize: 18,
    fontWeight: '700',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtnText: {
    color: '#1976D2',
    fontSize: 18,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    marginTop: 40,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  fabText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: '300',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#222',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
    gap: 12,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    fontSize: 15,
    color: '#222',
  },
});
