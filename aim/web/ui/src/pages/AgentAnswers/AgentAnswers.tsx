import React, { useEffect, useState } from 'react';

import { IconChevronDown, IconChevronUp, IconRobot } from '@tabler/icons-react';

import { getAPIHost } from 'config/config';

import './AgentAnswers.scss';

const FILE_NAMES = ['1.json', '2.json'] as const;
type FileName = typeof FILE_NAMES[number];
type AnswerMap = Partial<Record<FileName, unknown>>;
type EntryExpansionMap = Record<string, boolean>;

const getEntryId = (fileName: FileName, index: number) =>
  `${fileName}-${index}`;

const buildExpandedState = (payload: AnswerMap) => {
  const state: EntryExpansionMap = {};
  FILE_NAMES.forEach((name) => {
    const dataset = payload[name];
    if (Array.isArray(dataset)) {
      dataset.forEach((_, index) => {
        state[getEntryId(name, index)] = true;
      });
    }
  });
  return state;
};

const AgentAnswers = () => {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [expandedEntries, setExpandedEntries] = useState<EntryExpansionMap>({});

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');
      try {
        const entries = await Promise.all(
          FILE_NAMES.map(async (name) => {
            const response = await fetch(
              `${getAPIHost()}/agent/agent-answers/${name}`,
            );

            if (!response.ok) {
              throw new Error(
                `Unable to fetch ${name}: ${response.status} ${response.statusText}`,
              );
            }

            return [name, await response.json()] as const;
          }),
        );

        const answerMap = entries.reduce((acc, [name, payload]) => {
          acc[name] = payload;
          return acc;
        }, {} as AnswerMap);

        setAnswers(answerMap);
        setExpandedEntries(buildExpandedState(answerMap));
      } catch (err) {
        console.error('Error fetching agent answers:', err);
        setError('Failed to load agent answers.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatJSON = (payload: unknown) =>
    payload == null ? 'No data available' : JSON.stringify(payload, null, 2);

  const formatValue = (value: unknown) => {
    if (value == null) {
      return '—';
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }

    return String(value);
  };

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);

  const renderDataset = (dataset: unknown, fileName: FileName) => {
    if (dataset == null) {
      return <p className='agent-answers-panel__empty'>No data available.</p>;
    }

    if (Array.isArray(dataset)) {
      if (dataset.length === 0) {
        return (
          <p className='agent-answers-panel__empty'>No entries available.</p>
        );
      }

      return dataset.map((entry, index) => {
        const entryKey = getEntryId(fileName, index);
        const entryRows = isRecord(entry) ? Object.entries(entry) : [];
        const hasStructuredRows = entryRows.length > 0;
        const isExpanded = expandedEntries[entryKey] ?? false;

        const toggleEntry = () => {
          setExpandedEntries((prev) => ({
            ...prev,
            [entryKey]: !isExpanded,
          }));
        };

        const entryClassName = `agent-answers-entry${
          isExpanded ? ' agent-answers-entry--expanded' : ''
        }`;

        return (
          <section className={entryClassName} key={entryKey}>
            <header className='agent-answers-entry__header'>
              <span>Entry {index + 1}</span>
              <button
                type='button'
                className='agent-answers-entry__toggle'
                aria-expanded={isExpanded}
                aria-controls={`${entryKey}-body`}
                onClick={toggleEntry}
              >
                {isExpanded ? (
                  <>
                    Collapse
                    <IconChevronUp size={16} stroke={1.5} />
                  </>
                ) : (
                  <>
                    Expand
                    <IconChevronDown size={16} stroke={1.5} />
                  </>
                )}
              </button>
            </header>
            {isExpanded && (
              <div
                className='agent-answers-entry__body'
                id={`${entryKey}-body`}
              >
                {hasStructuredRows && (
                  <div className='agent-answers-entry__content'>
                    {entryRows.map(([key, value]) => (
                      <div
                        className='agent-answers-entry__row'
                        key={`${entryKey}-${key}`}
                      >
                        <span className='agent-answers-entry__key'>{key}</span>
                        <span className='agent-answers-entry__value'>
                          {formatValue(value)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className={`agent-answers-entry__raw${
                    hasStructuredRows
                      ? ''
                      : ' agent-answers-entry__raw--standalone'
                  }`}
                >
                  <span className='agent-answers-entry__raw-label'>
                    Full JSON
                  </span>
                  <pre>{formatJSON(entry)}</pre>
                </div>
              </div>
            )}
          </section>
        );
      });
    }

    return (
      <pre aria-label={`agent answer ${fileName}`}>{formatJSON(dataset)}</pre>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return <p className='agent-answers-status'>Loading agent answers...</p>;
    }

    if (error) {
      return (
        <p className='agent-answers-status agent-answers-status--error'>
          {error}
        </p>
      );
    }

    return (
      <div className='agent-answers-panels'>
        {FILE_NAMES.map((name) => (
          <article className='agent-answers-panel' key={name}>
            <header className='agent-answers-panel__header'>
              <div>
                <h3>{name}</h3>
                <span className='agent-answers-panel__hint'>
                  Static dataset
                </span>
              </div>
            </header>
            <div className='agent-answers-panel__body'>
              {renderDataset(answers[name], name)}
            </div>
          </article>
        ))}
      </div>
    );
  };

  return (
    <div className='agent-answers-container'>
      <div className='agent-answers-header'>
        <span className='agent-answers-icon'>
          <IconRobot size={28} stroke={1.5} />
        </span>
        <div>
          <h2>Answers</h2>
          <p>Review the two fixed snapshots served from the repository.</p>
        </div>
      </div>
      {renderContent()}
    </div>
  );
};

export default AgentAnswers;
