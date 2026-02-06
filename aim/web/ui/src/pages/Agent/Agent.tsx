import React, { memo, useState } from 'react';

import { Paper } from '@material-ui/core';

import BusyLoaderWrapper from 'components/BusyLoaderWrapper/BusyLoaderWrapper';
import ErrorBoundary from 'components/ErrorBoundary/ErrorBoundary';
import { Button, Icon, Text } from 'components/kit';

import agentAppModel from 'services/models/agent/agentAppModel';

import './Agent.scss';

interface IAgentProps {
  agentsList: string[];
  isAgentsDataLoading: boolean;
  isInstructLoading: boolean;
  instructResult: any;
}

function Agent({
  agentsList,
  isAgentsDataLoading,
  isInstructLoading,
  instructResult,
}: IAgentProps): React.FunctionComponentElement<React.ReactNode> {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');

  function handleRefresh() {
    agentAppModel.getAgentsData().call();
  }

  function handleSend() {
    if (!selectedAgent || !prompt.trim()) return;
    agentAppModel.instructAgent(selectedAgent, prompt.trim()).call();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <ErrorBoundary>
      <section className='Agent container'>
        <div className='Agent__header'>
          <Text size={18} weight={600} component='h2'>
            Agents
          </Text>
          <Button variant='outlined' size='small' onClick={handleRefresh}>
            <Icon name='reset' fontSize={14} />
            <span style={{ marginLeft: 4 }}>Refresh</span>
          </Button>
        </div>

        <div className='Agent__content'>
          <Paper className='Agent__list'>
            <Text size={14} weight={600} className='Agent__list__title'>
              Connected Agents
            </Text>
            <BusyLoaderWrapper isLoading={isAgentsDataLoading} height='100%'>
              {agentsList && agentsList.length > 0 ? (
                <ul className='Agent__list__items'>
                  {agentsList.map((runHash: string) => (
                    <li
                      key={runHash}
                      className={`Agent__list__item ${
                        selectedAgent === runHash
                          ? 'Agent__list__item--active'
                          : ''
                      }`}
                      onClick={() => setSelectedAgent(runHash)}
                    >
                      <Icon name='runs' fontSize={14} />
                      <Text
                        size={13 as any}
                        className='Agent__list__item__hash'
                      >
                        {runHash}
                      </Text>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className='Agent__list__empty'>
                  <Text size={13 as any} color='info'>
                    No agents connected
                  </Text>
                </div>
              )}
            </BusyLoaderWrapper>
          </Paper>

          <Paper className='Agent__instruct'>
            <Text size={14} weight={600} className='Agent__instruct__title'>
              Send Instruction
              {selectedAgent && (
                <Text
                  size={12}
                  weight={400}
                  color='info'
                  className='Agent__instruct__selected'
                >
                  &nbsp;to {selectedAgent}
                </Text>
              )}
            </Text>

            <div className='Agent__instruct__input'>
              <textarea
                className='Agent__instruct__textarea'
                placeholder={
                  selectedAgent
                    ? 'Type your instruction...'
                    : 'Select an agent first'
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!selectedAgent || isInstructLoading}
                rows={3}
              />
              <Button
                variant='contained'
                color='primary'
                size='small'
                onClick={handleSend}
                disabled={!selectedAgent || !prompt.trim() || isInstructLoading}
                className='Agent__instruct__sendBtn'
              >
                {isInstructLoading ? 'Sending...' : 'Send'}
              </Button>
            </div>

            {instructResult && (
              <Paper className='Agent__instruct__result' elevation={0}>
                <Text size={12} weight={600}>
                  Response ({instructResult.status})
                </Text>
                <pre className='Agent__instruct__result__body'>
                  {instructResult.status === 'completed'
                    ? instructResult.result
                    : instructResult.error}
                </pre>
              </Paper>
            )}
          </Paper>
        </div>
      </section>
    </ErrorBoundary>
  );
}

export default memo(Agent);
