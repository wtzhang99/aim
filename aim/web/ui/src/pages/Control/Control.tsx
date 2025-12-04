import React from 'react';
import { useModel } from 'hooks';

import {
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconPlug,
  IconPlugConnected,
  IconSend,
  IconSettings,
  IconX,
} from '@tabler/icons-react';

import AppBar from 'components/AppBar/AppBar';
import ErrorBoundary from 'components/ErrorBoundary/ErrorBoundary';
import { Button, Box, Text, Textarea, Input } from 'components/kit_v2';
import { Spinner } from 'components/kit';

import { getAPIHost } from 'config/config';

import runsAppModel from 'services/models/runs/runsAppModel';

interface RunState {
  prompt: string;
  aiResponse: string;
  isLoading: boolean;
  showResponse: boolean;
  error: string;
}

// Storage key for API key (using sessionStorage for security - cleared on browser close)
const API_KEY_STORAGE_KEY = 'aim_openai_api_key';

const Control = () => {
  const [connections, setConnections] = React.useState<Map<string, WebSocket>>(
    new Map(),
  );
  const [runStates, setRunStates] = React.useState<Map<string, RunState>>(
    new Map(),
  );

  // API Key state
  const [apiKey, setApiKey] = React.useState<string>(() => {
    // Initialize from sessionStorage (not localStorage for security)
    return sessionStorage.getItem(API_KEY_STORAGE_KEY) || '';
  });
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [showSettings, setShowSettings] = React.useState(false);
  const [apiKeyInput, setApiKeyInput] = React.useState('');

  const handleSaveApiKey = () => {
    setApiKey(apiKeyInput);
    sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKeyInput);
    setApiKeyInput('');
    setShowSettings(false);
  };

  const handleClearApiKey = () => {
    setApiKey('');
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    setApiKeyInput('');
  };

  const maskApiKey = (key: string): string => {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return `${key.slice(0, 4)}${'•'.repeat(
      Math.min(key.length - 8, 20),
    )}${key.slice(-4)}`;
  };

  const getRunState = (hash: string): RunState => {
    return (
      runStates.get(hash) || {
        prompt: '',
        aiResponse: '',
        isLoading: false,
        showResponse: false,
        error: '',
      }
    );
  };

  const updateRunState = (hash: string, updates: Partial<RunState>) => {
    setRunStates((prev) => {
      const next = new Map(prev);
      const current = getRunState(hash);
      next.set(hash, { ...current, ...updates });
      return next;
    });
  };

  const handleConnect = (runHash: string) => {
    if (connections.has(runHash)) {
      connections.get(runHash)?.close();
      return;
    }

    const ws = new WebSocket(
      `ws://localhost:43800/api/control/${runHash}/ws?client_type=ui`,
    );

    ws.onopen = () => {
      console.log(`WebSocket connected for run hash: ${runHash}`);
    };

    ws.onmessage = (event) => {
      console.log(`Message from ${runHash}:`, event.data);
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${runHash}:`, error);
    };

    ws.onclose = () => {
      console.log(`WebSocket closed for run hash: ${runHash}`);
      setConnections((prev) => {
        const next = new Map(prev);
        next.delete(runHash);
        return next;
      });
    };

    setConnections((prev) => new Map(prev).set(runHash, ws));
  };

  const generateId = () => {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const sendToControlServer = (runHash: string, message: string) => {
    const ws = connections.get(runHash);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({
        id: generateId(),
        type: 'command',
        payload: message,
        run_hash: runHash,
      });
      ws.send(msg);
      console.log(`Sent message to ${runHash}:`, msg);
    } else {
      console.error(`WebSocket is not open for run hash: ${runHash}`);
    }
  };

  const callOpenAI = async (runHash: string, prompt: string) => {
    if (!apiKey) {
      updateRunState(runHash, {
        isLoading: false,
        error: 'Please configure your OpenAI API key in Settings above.',
      });
      return;
    }

    updateRunState(runHash, {
      isLoading: true,
      error: '',
      showResponse: false,
    });

    try {
      // Use backend proxy to avoid CORS issues
      const response = await fetch(`${getAPIHost()}/control/openai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: apiKey,
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are an AI assistant helping to generate training control commands for machine learning experiments. Provide concise and actionable responses.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse =
        data.choices[0]?.message?.content || 'No response generated';

      updateRunState(runHash, {
        aiResponse,
        isLoading: false,
        showResponse: true,
      });
    } catch (error: any) {
      updateRunState(runHash, {
        isLoading: false,
        error: error.message || 'Failed to get AI response',
      });
    }
  };

  const handleAccept = (runHash: string) => {
    const state = getRunState(runHash);
    sendToControlServer(runHash, state.aiResponse);
    updateRunState(runHash, {
      prompt: '',
      aiResponse: '',
      showResponse: false,
    });
  };

  const handleReject = (runHash: string) => {
    updateRunState(runHash, {
      aiResponse: '',
      showResponse: false,
    });
  };

  const runsData = useModel<any>(runsAppModel);

  React.useEffect(() => {
    runsAppModel.initialize();
    return () => {
      runsAppModel.destroy();
      connections.forEach((ws) => ws.close());
    };
  }, []);

  const runHashes = runsData?.rawData?.map((run: any) => run.hash) || [];

  return (
    <ErrorBoundary>
      <AppBar title='Training Control' />
      <Box css={{ padding: '$9', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Settings Section */}
        <Box
          css={{
            marginBottom: '$7',
            border: '1px solid $secondary30',
            borderRadius: '$3',
            overflow: 'hidden',
          }}
        >
          <Box
            css={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '$4 $5',
              backgroundColor: '$secondary10',
              cursor: 'pointer',
              '&:hover': {
                backgroundColor: '$secondary20',
              },
            }}
            onClick={() => setShowSettings(!showSettings)}
          >
            <Box css={{ display: 'flex', alignItems: 'center', gap: '$3' }}>
              <IconSettings size={18} />
              <Text weight='$3'>Settings</Text>
              {apiKey && (
                <Box
                  css={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '$2',
                    padding: '$1 $3',
                    backgroundColor: '$success20',
                    borderRadius: '$pill',
                  }}
                >
                  <IconKey size={12} />
                  <Text size='$2' color='$success100'>
                    API Key Configured
                  </Text>
                </Box>
              )}
            </Box>
            <Text size='$2' color='$secondary80'>
              {showSettings ? 'Hide' : 'Show'}
            </Text>
          </Box>

          {showSettings && (
            <Box css={{ padding: '$5', borderTop: '1px solid $secondary20' }}>
              <Text
                size='$3'
                weight='$3'
                css={{ marginBottom: '$4', display: 'block' }}
              >
                OpenAI API Key
              </Text>

              {apiKey ? (
                <Box>
                  <Box
                    css={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '$3',
                      marginBottom: '$4',
                    }}
                  >
                    <Box
                      css={{
                        flex: 1,
                        padding: '$3 $4',
                        backgroundColor: '$secondary10',
                        borderRadius: '$2',
                        fontFamily: '$mono',
                        fontSize: '$3',
                      }}
                    >
                      {showApiKey ? apiKey : maskApiKey(apiKey)}
                    </Box>
                    <Button
                      size='sm'
                      variant='ghost'
                      color='secondary'
                      onClick={() => setShowApiKey(!showApiKey)}
                      leftIcon={
                        showApiKey ? (
                          <IconEyeOff size={16} />
                        ) : (
                          <IconEye size={16} />
                        )
                      }
                    >
                      {showApiKey ? 'Hide' : 'Show'}
                    </Button>
                    <Button
                      size='sm'
                      variant='outlined'
                      color='secondary'
                      onClick={handleClearApiKey}
                    >
                      Remove
                    </Button>
                  </Box>
                  <Text size='$2' color='$secondary70'>
                    Your API key is stored in session storage and will be
                    cleared when you close the browser.
                  </Text>
                </Box>
              ) : (
                <Box>
                  <Box
                    css={{
                      display: 'flex',
                      gap: '$3',
                      alignItems: 'flex-start',
                      marginBottom: '$3',
                    }}
                  >
                    <Box css={{ flex: 1 }}>
                      <Input
                        type='password'
                        placeholder='sk-...'
                        value={apiKeyInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setApiKeyInput(e.target.value)
                        }
                        css={{ width: '100%' }}
                      />
                    </Box>
                    <Button
                      size='md'
                      color='primary'
                      onClick={handleSaveApiKey}
                      disabled={!apiKeyInput.trim()}
                    >
                      Save Key
                    </Button>
                  </Box>
                  <Text size='$2' color='$secondary70'>
                    Your API key will be stored in session storage (cleared when
                    browser closes). It is sent through the AIM backend proxy to
                    OpenAI and is not stored on the server.
                  </Text>
                </Box>
              )}
            </Box>
          )}
        </Box>

        <Text as='h2' size='$6' weight='$3' css={{ marginBottom: '$7' }}>
          Active Runs
        </Text>

        {runHashes.length === 0 ? (
          <Box
            css={{
              textAlign: 'center',
              padding: '$13',
              backgroundColor: '$secondary10',
              borderRadius: '$3',
            }}
          >
            <Text color='$secondary80'>No active runs found</Text>
          </Box>
        ) : (
          <Box css={{ display: 'flex', flexDirection: 'column', gap: '$7' }}>
            {runHashes.map((hash: string) => {
              const isConnected = connections.has(hash);
              const state = getRunState(hash);

              return (
                <Box
                  key={hash}
                  css={{
                    border: '1px solid $secondary30',
                    borderRadius: '$3',
                    padding: '$7',
                    backgroundColor: '$background',
                    transition: 'box-shadow 0.2s ease',
                    '&:hover': {
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                    },
                  }}
                >
                  {/* Header */}
                  <Box
                    css={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: isConnected ? '$5' : 0,
                    }}
                  >
                    <Box
                      css={{ display: 'flex', alignItems: 'center', gap: '$4' }}
                    >
                      <Box
                        css={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '$round',
                          backgroundColor: isConnected
                            ? '$success100'
                            : '$secondary50',
                        }}
                      />
                      <Text weight='$3' mono css={{ fontSize: '$4' }}>
                        {hash}
                      </Text>
                    </Box>
                    <Button
                      size='md'
                      variant={isConnected ? 'outlined' : 'contained'}
                      color={isConnected ? 'secondary' : 'primary'}
                      onClick={() => handleConnect(hash)}
                      leftIcon={
                        isConnected ? (
                          <IconPlug size={16} />
                        ) : (
                          <IconPlugConnected size={16} />
                        )
                      }
                    >
                      {isConnected ? 'Disconnect' : 'Connect'}
                    </Button>
                  </Box>

                  {/* Connected Panel */}
                  {isConnected && (
                    <Box
                      css={{
                        borderTop: '1px solid $secondary20',
                        paddingTop: '$5',
                      }}
                    >
                      {/* Prompt Input */}
                      <Box css={{ marginBottom: '$5' }}>
                        <Text
                          size='$3'
                          weight='$3'
                          css={{ marginBottom: '$3', display: 'block' }}
                        >
                          Enter your prompt
                        </Text>
                        <Box
                          css={{
                            display: 'flex',
                            gap: '$4',
                            alignItems: 'flex-start',
                          }}
                        >
                          <Box css={{ flex: 1 }}>
                            <Textarea
                              placeholder='Describe what you want to do with this training run...'
                              value={state.prompt}
                              onChange={(
                                e: React.ChangeEvent<HTMLTextAreaElement>,
                              ) =>
                                updateRunState(hash, { prompt: e.target.value })
                              }
                              css={{ minHeight: '80px', width: '100%' }}
                              disabled={state.isLoading}
                            />
                          </Box>
                          <Button
                            size='md'
                            color='primary'
                            onClick={() => callOpenAI(hash, state.prompt)}
                            disabled={!state.prompt.trim() || state.isLoading}
                            leftIcon={
                              state.isLoading ? undefined : (
                                <IconSend size={16} />
                              )
                            }
                          >
                            {state.isLoading ? (
                              <Box
                                css={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '$3',
                                }}
                              >
                                <Spinner
                                  size={16}
                                  thickness={2}
                                  color='white'
                                />
                                <span>Generating...</span>
                              </Box>
                            ) : (
                              'Generate'
                            )}
                          </Button>
                        </Box>
                      </Box>

                      {/* Error Message */}
                      {state.error && (
                        <Box
                          css={{
                            padding: '$4',
                            backgroundColor: '$danger10',
                            borderRadius: '$2',
                            marginBottom: '$5',
                          }}
                        >
                          <Text color='$danger100' size='$3'>
                            {state.error}
                          </Text>
                        </Box>
                      )}

                      {/* AI Response Panel */}
                      {state.showResponse && (
                        <Box
                          css={{
                            backgroundColor: '$primary10',
                            borderRadius: '$3',
                            padding: '$5',
                            border: '1px solid $primary30',
                          }}
                        >
                          <Text
                            size='$3'
                            weight='$3'
                            color='$primary100'
                            css={{ marginBottom: '$4', display: 'block' }}
                          >
                            AI Generated Response
                          </Text>
                          <Box
                            css={{
                              backgroundColor: '$background',
                              padding: '$4',
                              borderRadius: '$2',
                              marginBottom: '$5',
                              whiteSpace: 'pre-wrap',
                              fontFamily: '$mono',
                              fontSize: '$3',
                              lineHeight: '1.5',
                              maxHeight: '200px',
                              overflow: 'auto',
                            }}
                          >
                            {state.aiResponse}
                          </Box>
                          <Box
                            css={{
                              display: 'flex',
                              gap: '$4',
                              justifyContent: 'flex-end',
                            }}
                          >
                            <Button
                              size='md'
                              variant='outlined'
                              color='secondary'
                              onClick={() => handleReject(hash)}
                              leftIcon={<IconX size={16} />}
                            >
                              Reject
                            </Button>
                            <Button
                              size='md'
                              color='success'
                              onClick={() => handleAccept(hash)}
                              leftIcon={<IconCheck size={16} />}
                            >
                              Accept & Send
                            </Button>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>
    </ErrorBoundary>
  );
};

export default React.memo(Control);
