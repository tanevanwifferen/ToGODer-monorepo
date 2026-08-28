import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Colors } from '../../constants/Colors';
import CustomCheckbox from '../ui/CustomCheckbox';
import { selectIsAuthenticated } from '../../redux/slices/authSlice';
import {
  fetchMcpServers,
  createMcpServer,
  updateMcpServer,
  deleteMcpServer,
  clearMcpError,
  selectMcpServers,
  selectMcpLoading,
  selectMcpError,
} from '../../redux/slices/mcpSlice';
import type { McpServerDto } from '../../apiClients/McpApiClient';

interface HeaderRow {
  key: string;
  value: string;
}

const emptyForm = (): { name: string; url: string; headers: HeaderRow[] } => ({
  name: '',
  url: '',
  headers: [],
});

/**
 * Settings component for managing per-user HTTP MCP servers. Reads/writes via
 * the REST API only (servers are server-side source of truth, never persisted
 * in the sync blob). Header VALUES are never returned by the server, so when
 * editing an existing server the header inputs are left empty (empty = keep
 * existing) and existing headers are indicated by a masked placeholder.
 */
const McpSettings = () => {
  const dispatch = useDispatch<any>();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const isAuthenticated = useSelector(selectIsAuthenticated);
  const servers = useSelector(selectMcpServers);
  const loading = useSelector(selectMcpLoading);
  const error = useSelector(selectMcpError);

  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // When editing, track whether the user touched the headers section. Per the
  // PUT contract: omitted `headers` => preserve; sent (incl. {}) => replace.
  const [headersTouched, setHeadersTouched] = useState(false);
  // Client-side validation errors (cleared on input change via dependent logic)
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchMcpServers());
    }
  }, [isAuthenticated, dispatch]);

  // Clear the inline error whenever the user starts editing the form again.
  const resetError = () => {
    if (error) dispatch(clearMcpError());
  };

  const startAdd = () => {
    setForm(emptyForm());
    setEditingId(null);
    setIsAdding(true);
    setHeadersTouched(false);
    setValidationError(null);
    resetError();
  };

  const startEdit = (s: McpServerDto) => {
    setForm({ name: s.name, url: s.url, headers: [] });
    setEditingId(s.id);
    setHeadersTouched(false);
    resetError();
  };

  const cancelForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setIsAdding(false);
    setHeadersTouched(false);
    setValidationError(null);
    resetError();
  };

  /** Build the headers object to send, honoring the preserve-vs-replace contract. */
  const buildHeaders = (): Record<string, string> | undefined => {
    if (!headersTouched) return undefined; // preserve existing
    const out: Record<string, string> = {};
    for (const row of form.headers) {
      const k = row.key.trim();
      if (k) out[k] = row.value;
    }
    return out; // possibly {} => clear
  };

  /** Client-side validation: reject empty name and invalid URLs. */
  const validate = (): boolean => {
    setValidationError(null);
    if (!form.name.trim()) {
      setValidationError('Server name is required.');
      return false;
    }
    if (!form.url.trim()) {
      setValidationError('Server URL is required.');
      return false;
    }
    try {
      const u = new URL(form.url.trim());
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setValidationError('URL must start with http:// or https://');
        return false;
      }
    } catch {
      setValidationError('Invalid URL format.');
      return false;
    }
    return true;
  };

  const submit = async () => {
    resetError();
    if (!validate()) return;
    if (editingId) {
      await dispatch(
        updateMcpServer({
          id: editingId,
          body: {
            name: form.name.trim(),
            url: form.url.trim(),
            headers: buildHeaders(),
          },
        })
      );
    } else {
      await dispatch(
        createMcpServer({
          name: form.name.trim(),
          url: form.url.trim(),
          headers: buildHeaders(),
        })
      );
    }
    // Re-fetch so the list stays in sync (also done in the thunk lifecycle,
    // but the explicit refresh guards against any partial state).
    await dispatch(fetchMcpServers());
    // On a successful create/update the error stays null; collapse the form.
    // (If the thunk rejected, `error` is now set and we keep the form open.)
    const state = (dispatch as any).getState?.() as any;
    if (!state?.mcp?.error) {
      cancelForm();
    }
  };

  const toggleEnabled = (s: McpServerDto) => {
    dispatch(updateMcpServer({ id: s.id, body: { enabled: !s.enabled } })).then(
      () => dispatch(fetchMcpServers())
    );
  };

  const remove = (s: McpServerDto) => {
    dispatch(deleteMcpServer(s.id)).then(() => dispatch(fetchMcpServers()));
  };

  const inputWidth = Platform.OS === 'web' ? styles.webInput : undefined;

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            MCP Servers
          </Text>
          <Text style={[styles.warningText, { color: theme.icon }]}>
            Sign in to configure MCP servers.
          </Text>
        </View>
      </View>
    );
  }

  const isEditing = editingId !== null;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.section}>
        <Text style={[styles.label, { color: theme.text }]}>MCP Servers</Text>
        <Text style={[styles.description, { color: theme.icon }]}>
          Connect HTTP MCP servers. Their tools become available to the agent.
        </Text>
      </View>

      {error && (
        <View style={styles.section}>
          <Text style={[styles.errorText, { color: theme.error }]}>
            {error}
          </Text>
        </View>
      )}

      {/* List of configured servers */}
      {loading && servers.length === 0 && (
        <View style={styles.section}>
          <Text style={[styles.description, { color: theme.icon }]}>
            Loading…
          </Text>
        </View>
      )}

      {servers.map((s) => (
        <View
          key={s.id}
          style={[
            styles.serverRow,
            { borderColor: theme.icon, backgroundColor: theme.background },
          ]}
        >
          <View style={styles.serverHeader}>
            <Text style={[styles.serverName, { color: theme.text }]}>
              {s.name}
            </Text>
            <View style={styles.checkboxSection}>
              <CustomCheckbox
                value={s.enabled}
                onValueChange={() => toggleEnabled(s)}
                color={theme.tint}
                colorScheme={colorScheme}
              />
              <Text style={[styles.checkboxLabel, { color: theme.text }]}>
                {s.enabled ? 'Enabled' : 'Disabled'}
              </Text>
            </View>
          </View>
          <Text style={[styles.serverUrl, { color: theme.icon }]}>{s.url}</Text>
          {s.hasHeaders && (
            <Text style={[styles.serverUrl, { color: theme.icon }]}>
              Headers configured (values hidden)
            </Text>
          )}
          <View style={styles.rowActions}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: theme.tint },
              ]}
              onPress={() => startEdit(s)}
            >
              <Text style={styles.actionButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: theme.error },
              ]}
              onPress={() => remove(s)}
            >
              <Text style={styles.actionButtonText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Add / Edit form */}
      {isAdding || isEditing || servers.length === 0 ? (
        <View style={styles.section}>
          <Text style={[styles.subLabel, { color: theme.text }]}>
            {isEditing ? 'Edit MCP Server' : 'Add MCP Server'}
          </Text>

          {validationError && (
            <Text style={[styles.errorText, { color: theme.error, marginBottom: 12 }]}>
              {validationError}
            </Text>
          )}

          <Text style={[styles.fieldLabel, { color: theme.icon }]}>Name</Text>
          <TextInput
            style={[
              styles.input,
              inputWidth,
              {
                backgroundColor: theme.background,
                color: theme.text,
                borderColor: theme.icon,
              },
            ]}
            value={form.name}
            onChangeText={(v) => setForm({ ...form, name: v })}
            placeholder="My MCP server"
            placeholderTextColor={theme.icon}
          />

          <Text style={[styles.fieldLabel, { color: theme.icon }]}>URL</Text>
          <TextInput
            style={[
              styles.input,
              inputWidth,
              {
                backgroundColor: theme.background,
                color: theme.text,
                borderColor: theme.icon,
              },
            ]}
            value={form.url}
            onChangeText={(v) => setForm({ ...form, url: v })}
            placeholder="https://example.com/mcp"
            placeholderTextColor={theme.icon}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={[styles.fieldLabel, { color: theme.icon }]}>
            Headers (optional)
          </Text>
          {isEditing && !headersTouched && (
            <Text style={[styles.hint, { color: theme.icon }]}>
              {servers.find((x) => x.id === editingId)?.hasHeaders
                ? 'Existing headers are preserved. Add a row below to replace them.'
                : 'Leave empty to keep as-is.'}
            </Text>
          )}
          {form.headers.map((row, idx) => (
            <View key={idx} style={styles.headerRow}>
              <TextInput
                style={[
                  styles.headerInput,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.icon,
                  },
                ]}
                value={row.key}
                onChangeText={(v) => {
                  const next = [...form.headers];
                  next[idx] = { ...next[idx], key: v };
                  setForm({ ...form, headers: next });
                  setHeadersTouched(true);
                }}
                placeholder="Header name"
                placeholderTextColor={theme.icon}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={[
                  styles.headerInput,
                  {
                    backgroundColor: theme.background,
                    color: theme.text,
                    borderColor: theme.icon,
                  },
                ]}
                value={row.value}
                onChangeText={(v) => {
                  const next = [...form.headers];
                  next[idx] = { ...next[idx], value: v };
                  setForm({ ...form, headers: next });
                  setHeadersTouched(true);
                }}
                placeholder="Header value"
                placeholderTextColor={theme.icon}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={isEditing}
              />
              <TouchableOpacity
                style={[styles.removeHeader, { borderColor: theme.icon }]}
                onPress={() => {
                  const next = form.headers.filter((_, i) => i !== idx);
                  setForm({ ...form, headers: next });
                  setHeadersTouched(true);
                }}
              >
                <Text style={[styles.removeHeaderText, { color: theme.icon }]}>
                  ✕
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.linkButton, { borderColor: theme.tint }]}
            onPress={() => {
              setForm({
                ...form,
                headers: [...form.headers, { key: '', value: '' }],
              });
              setHeadersTouched(true);
            }}
          >
            <Text style={[styles.linkButtonText, { color: theme.tint }]}>
              + Add header
            </Text>
          </TouchableOpacity>

          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.tint }]}
              onPress={submit}
            >
              <Text style={styles.actionButtonText}>
                {isEditing ? 'Save' : 'Add server'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.icon }]}
              onPress={cancelForm}
            >
              <Text style={styles.actionButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.tint }]}
            onPress={startAdd}
          >
            <Text style={styles.actionButtonText}>Add MCP Server</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    minHeight: 300,
  },
  section: {
    marginBottom: 32,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  subLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    marginTop: 8,
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#687076',
  },
  warningText: {
    fontSize: 13,
    marginTop: 8,
    fontStyle: 'italic',
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 13,
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 12,
    fontSize: 16,
    minHeight: 48,
    width: '100%',
    maxWidth: 400,
  },
  webInput: {},
  serverRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    maxWidth: 600,
  },
  serverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  serverName: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
  },
  serverUrl: {
    fontSize: 13,
    marginBottom: 4,
  },
  checkboxSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 14,
  },
  rowActions: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  formActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  actionButton: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 96,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    maxWidth: 600,
  },
  headerInput: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
    fontSize: 14,
    minHeight: 44,
    flex: 1,
  },
  removeHeader: {
    borderWidth: 1,
    borderRadius: 4,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeHeaderText: {
    fontSize: 16,
  },
  linkButton: {
    borderWidth: 1,
    borderRadius: 4,
    padding: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  linkButtonText: {
    fontSize: 14,
  },
});

export default McpSettings;
