import React, { useEffect, useState } from 'react';

import { getAPIHost } from 'config/config';

const FILE_NAMES = ['1.json', '2.json'] as const;

const AgentAnswers = () => {
  const [data1, setData1] = useState<unknown>(null);
  const [data2, setData2] = useState<unknown>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError('');
      try {
        const responses = await Promise.all(
          FILE_NAMES.map((name) =>
            fetch(`${getAPIHost()}/agent/agent-answers/${name}`),
          ),
        );

        responses.forEach((response, index) => {
          if (!response.ok) {
            throw new Error(
              `Unable to fetch ${FILE_NAMES[index]}: ${response.statusText}`,
            );
          }
        });

        const [json1, json2] = await Promise.all(
          responses.map((response) => response.json()),
        );

        setData1(json1);
        setData2(json2);
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

  const renderContent = () => {
    if (isLoading) {
      return <p>Loading agent answers...</p>;
    }

    if (error) {
      return <p className='error-text'>{error}</p>;
    }

    return (
      <div className='json-display'>
        <h3>1.json</h3>
        <pre>{formatJSON(data1)}</pre>
        <h3>2.json</h3>
        <pre>{formatJSON(data2)}</pre>
      </div>
    );
  };

  return (
    <div className='agent-answers-container'>
      <h2>Agent Answers</h2>
      {renderContent()}
    </div>
  );
};

export default AgentAnswers;
